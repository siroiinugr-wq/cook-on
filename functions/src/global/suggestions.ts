// 共有の材料への提案（globalSuggestions）と、運営の精査。
// - onIngredientShared：設定 shareIngredients がオンのお店で、アレルゲンを確かめた材料が変わったら提案を作る（新しい呼び方・アレルゲンの違い・自分の仕入れ値・共有に無い材料）
// - estimateRefPrices：参考価格が無い共有の材料の値段を、AIが Google 検索で調べて提案にする（出典つき。運営だけ。お店のクレジットは使わない）
// - reviewSuggestion：運営が採用・却下する。採用した分だけ globalIngredients に入る
// 運営かどうかは operators/{uid} があるか（Firebase コンソールで MASA が作る）
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { ALLERGENS, sortAllergens, type AllergenId } from "../shared/allergens";
import { buildSuggestion, suggestionRefPrice } from "../shared/suggest";
import type { GlobalIngredient, GlobalSuggestion, Ingredient } from "../shared/types";
import { isUnit, type Unit } from "../shared/units";
import { costYen, GEMINI_API_KEY, GEMINI_MODEL, REGION } from "../ai/config";
import { addUsage, callGeminiSearchJson, type Usage, type WebSource } from "../ai/gemini";
import { PRICE_SEARCH_SYSTEM, type PriceSearchAnswer } from "../ai/prompts";
import { idOf } from "../core/auth";

const COL = "globalSuggestions";
/** 1回に調べる材料の数（1つずつ検索するので時間がかかる。残りはもう一度押す）と、同時に調べる数 */
const ESTIMATE_MAX = 40;
const SEARCH_PARALLEL = 4;

export async function requireOperator(auth: { uid: string } | undefined): Promise<string> {
  if (!auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  const op = await getFirestore().doc(`operators/${auth.uid}`).get();
  if (!op.exists) throw new HttpsError("permission-denied", "運営の人だけが使えます。");
  return auth.uid;
}

const month = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);

/** ネットで調べた材料の値段（税込）。見たページと Google の「検索の候補」つき */
export interface WebPrice {
  price: number; qty: number; unit: Unit; basis: string; n: number; c: number;
  sources: WebSource[]; searchHtml: string;
}

/** 材料1つの今のネットの販売価格を、AIが Google 検索で調べる。見つからない・自信が低ければ found は null */
export async function searchRefPrice(m: { name: string; aliases?: string[]; category?: string }, minC = 0): Promise<{ found: WebPrice | null; usage: Usage }> {
  const r = await callGeminiSearchJson<PriceSearchAnswer>({
    system: PRICE_SEARCH_SYSTEM,
    prompt: `材料：${m.name}${m.aliases?.length ? `（別名：${m.aliases.slice(0, 3).join("・")}）` : ""}${m.category ? `\n分類：${m.category}` : ""}`,
    maxOutputTokens: 2048,
  });
  const a = r.output;
  const unit = String(a?.unit ?? "") as Unit;
  const c = Math.max(0, Math.min(1, Number(a?.c) || 0));
  if (!a || !(a.price > 0) || !(a.qty > 0) || !isUnit(unit) || !["g", "kg", "ml", "l", "個"].includes(unit) || c < minC) return { found: null, usage: r.usage };
  return {
    found: { price: a.price, qty: a.qty, unit, basis: String(a.basis ?? "").slice(0, 80), n: Number(a.n) > 0 ? Math.round(Number(a.n)) : 0, c, sources: r.sources.slice(0, 8), searchHtml: r.searchHtml.slice(0, 20000) },
    usage: r.usage,
  };
}

/** ネットの値段を、運営が精査する共有の材料への提案にする（値段は税抜で持つ。ネットの値段は税込なので割り戻す） */
export function webPriceSuggestion(g: Pick<GlobalIngredient, "id" | "name">, w: WebPrice): Omit<GlobalSuggestion, "id"> {
  return {
    source: "ai", kind: "update", status: "pending", orgId: null, orgName: w.sources.length ? "ネットの価格（AIが検索）" : "AIの推定", ingredientId: null,
    globalId: g.id, globalName: g.name, name: g.name, aliases: [], allergens: null, labelName: "",
    price: { price: Math.round((w.price / 1.08) * 10) / 10, qty: w.qty, unit: w.unit },
    note: `${w.basis}・${w.n ? `${w.n}店・` : ""}自信 ${Math.round(w.c * 100)}%・税込 ${Math.round(w.price)}円`,
    sources: w.sources, searchHtml: w.searchHtml,
    sig: `ai:${w.price}:${w.qty}:${w.unit}`, updatedAt: FieldValue.serverTimestamp(),
  };
}

export const onIngredientShared = onDocumentWritten(
  { document: "organizations/{orgId}/ingredients/{ingredientId}", region: REGION },
  async (event) => {
    const { orgId, ingredientId } = event.params;
    const after = event.data?.after.data() as Ingredient | undefined;
    if (!after || after.allergensConfirmed !== true) return;
    const db = getFirestore();
    const org = await db.doc(`organizations/${orgId}`).get();
    if (org.get("settings.shareIngredients") !== true) return;
    let g: GlobalIngredient | null = null;
    if (after.globalRef) {
      const gs = await db.doc(`globalIngredients/${after.globalRef}`).get();
      if (!gs.exists) return; // 既製品（ugcProducts）などに結びついているものは、既製品の仕組みで共有する
      g = { ...(gs.data() as GlobalIngredient), id: gs.id };
    }
    const draft = buildSuggestion({ ...after, id: ingredientId }, g);
    if (!draft) return;
    const ref = db.doc(`${COL}/${orgId}_${ingredientId}`);
    const cur = await ref.get();
    // 同じ中身をもう見た（採用・却下した）なら出し直さない
    if (cur.exists && cur.get("sig") === draft.sig) return;
    await ref.set({ ...draft, source: "shop", status: "pending", orgId, orgName: String(org.get("name") ?? ""), ingredientId, updatedAt: FieldValue.serverTimestamp() });
  },
);

/**
 * 参考価格の無い共有の材料の値段を、AIが Google 検索で今のネットの販売価格を調べて提案にする（材料1つずつ、出典つき）。
 * 運営の費用（お店のクレジットは使わない）。結果は精査画面で運営が出典を見て採用する
 */
export const estimateRefPrices = onCall({ region: REGION, timeoutSeconds: 540, secrets: [GEMINI_API_KEY] }, async (req) => {
  const uid = await requireOperator(req.auth);
  const db = getFirestore();
  const [snap, pending] = await Promise.all([
    db.collection("globalIngredients").where("source", "in", ["base", "shop", "ugc"]).get(),
    db.collection(COL).where("source", "==", "ai").where("status", "==", "pending").get(),
  ]);
  const waiting = new Set(pending.docs.map((d) => String(d.get("globalId"))));
  const all = snap.docs.map((d) => ({ ...(d.data() as GlobalIngredient), id: d.id })).filter((g) => !g.refPrice && !waiting.has(g.id));
  const targets = all.slice(0, ESTIMATE_MAX);
  if (!targets.length) return { made: 0, checked: 0, left: 0 };
  let usage: Usage = { in: 0, out: 0 };
  let made = 0;
  for (let i = 0; i < targets.length; i += SEARCH_PARALLEL) {
    await Promise.all(targets.slice(i, i + SEARCH_PARALLEL).map(async (g) => {
      try {
        const r = await searchRefPrice(g);
        usage = addUsage(usage, r.usage);
        if (!r.found) return;
        await db.doc(`${COL}/ai_${g.id}`).set(webPriceSuggestion(g, r.found));
        made++;
      } catch (e) {
        console.warn("参考価格の検索に失敗", g.id, String((e as Error)?.message ?? e));
      }
    }));
  }
  // AIの原価は aiRequests だけに残す（お店の記録には出さない）。検索は1回ごとに別の料金がかかる
  await db.collection("aiRequests").add({ kind: "estimateRefPrices", by: uid, usage, searches: targets.length, costYen: costYen(usage), model: GEMINI_MODEL, at: FieldValue.serverTimestamp() });
  return { made, checked: targets.length, left: all.length - targets.length };
});

interface Decision {
  id: string;
  accept: boolean;
  /** 採用するときに運営が直した中身 */
  name?: string;
  category?: string;
  aliases?: string[];
  allergens?: AllergenId[] | null;
  usePrice?: boolean;
}

export const reviewSuggestion = onCall({ region: REGION }, async (req) => {
  const uid = await requireOperator(req.auth);
  const d = req.data as Decision;
  const id = idOf(d?.id, "提案");
  const db = getFirestore();
  const ref = db.doc(`${COL}/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "提案が見つかりません。");
  const s = { ...(snap.data() as GlobalSuggestion), id };
  const done = { status: d.accept ? "accepted" : "rejected", reviewedBy: uid, reviewedAt: FieldValue.serverTimestamp() };
  if (!d.accept) {
    await ref.update(done);
    return { globalId: null };
  }
  const aliases = [...new Set((Array.isArray(d.aliases) ? d.aliases : s.aliases).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 20);
  const allergens = d.allergens === null ? null : sortAllergens((Array.isArray(d.allergens) ? d.allergens : s.allergens ?? []).filter((a): a is AllergenId => ALLERGENS.some((x) => x.id === a)));
  const refPrice = d.usePrice ? suggestionRefPrice(s, month()) : null;

  let globalId = s.globalId;
  if (s.kind === "new") {
    const name = String(d.name ?? s.name).trim().slice(0, 60);
    if (!name) throw new HttpsError("invalid-argument", "名前を入れてください。");
    const gref = db.collection("globalIngredients").doc();
    globalId = `shop_${gref.id}`;
    await db.doc(`globalIngredients/${globalId}`).set({
      name, aliases: aliases.filter((a) => a !== name), category: String(d.category ?? "お店から").slice(0, 20) || "お店から",
      allergens: allergens ?? [], source: "shop", ...(refPrice ? { refPrice } : {}), createdAt: FieldValue.serverTimestamp(),
    });
    // 出してくれたお店の材料も、新しい共有の材料に結ぶ
    if (s.orgId && s.ingredientId) await db.doc(`organizations/${s.orgId}/ingredients/${s.ingredientId}`).set({ globalRef: globalId }, { merge: true }).catch(() => undefined);
  } else {
    if (!globalId) throw new HttpsError("failed-precondition", "結び先の共有の材料がありません。");
    const gs = await db.doc(`globalIngredients/${globalId}`).get();
    if (!gs.exists) throw new HttpsError("not-found", "共有の材料が見つかりません。");
    const g = gs.data() as GlobalIngredient;
    await gs.ref.set({
      aliases: [...new Set([...(g.aliases ?? []), ...aliases])].filter((a) => a !== g.name).slice(0, 50),
      ...(allergens ? { allergens } : {}),
      ...(refPrice ? { refPrice } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await ref.update({ ...done, globalId });
  return { globalId };
});
