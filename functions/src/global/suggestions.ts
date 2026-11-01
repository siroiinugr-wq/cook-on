// 共有の材料への提案（globalSuggestions）と、運営の精査。
// - onIngredientShared：設定 shareIngredients がオンのお店で、アレルゲンを確かめた材料が変わったら提案を作る（新しい呼び方・アレルゲンの違い・自分の仕入れ値・共有に無い材料）
// - estimateRefPrices：参考価格が無い共有の材料に、AIの推定値段を提案として作る（運営だけ。お店のクレジットは使わない）
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
import { addUsage, callGeminiJson, type Usage } from "../ai/gemini";
import { PRICE_ESTIMATE_SCHEMA, PRICE_ESTIMATE_SYSTEM, type PriceEstimateAnswer } from "../ai/prompts";
import { idOf } from "../core/auth";

const COL = "globalSuggestions";
const ESTIMATE_BATCH = 20;
const ESTIMATE_MAX = 100;

export async function requireOperator(auth: { uid: string } | undefined): Promise<string> {
  if (!auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  const op = await getFirestore().doc(`operators/${auth.uid}`).get();
  if (!op.exists) throw new HttpsError("permission-denied", "運営の人だけが使えます。");
  return auth.uid;
}

const month = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);

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

export const estimateRefPrices = onCall({ region: REGION, timeoutSeconds: 540, secrets: [GEMINI_API_KEY] }, async (req) => {
  const uid = await requireOperator(req.auth);
  const db = getFirestore();
  const snap = await db.collection("globalIngredients").where("source", "in", ["base", "shop", "ugc"]).get();
  const targets = snap.docs.map((d) => ({ ...(d.data() as GlobalIngredient), id: d.id })).filter((g) => !g.refPrice).slice(0, ESTIMATE_MAX);
  if (!targets.length) return { made: 0, checked: 0 };
  let usage: Usage = { in: 0, out: 0 };
  let made = 0;
  for (let i = 0; i < targets.length; i += ESTIMATE_BATCH) {
    const b = targets.slice(i, i + ESTIMATE_BATCH);
    try {
      const prompt = b.map((g, k) => `${k}. ${g.name}${g.aliases?.length ? `（${g.aliases.slice(0, 3).join("・")}）` : ""}`).join("\n");
      const r = await callGeminiJson<PriceEstimateAnswer>({ system: PRICE_ESTIMATE_SYSTEM, prompt, schema: PRICE_ESTIMATE_SCHEMA, maxOutputTokens: 4096 });
      usage = addUsage(usage, r.usage);
      const w = db.batch();
      b.forEach((g, k) => {
        const a = r.output.r?.find((x) => x.i === k);
        const unit = String(a?.unit ?? "") as Unit;
        if (!a || !(a.price > 0) || !(a.qty > 0) || !isUnit(unit) || !["g", "kg", "ml", "l", "個"].includes(unit)) return;
        const c = Math.max(0, Math.min(1, Number(a.c) || 0));
        const s: Omit<GlobalSuggestion, "id"> = {
          source: "ai", kind: "update", status: "pending", orgId: null, orgName: "AIの推定", ingredientId: null,
          globalId: g.id, globalName: g.name, name: g.name, aliases: [], allergens: null, labelName: "",
          // 提案の値段は税抜で持つ（お店の提案とそろえる）。AIは税込で答えるので割り戻す
          price: { price: Math.round((a.price / 1.08) * 10) / 10, qty: a.qty, unit },
          note: `${String(a.basis ?? "").slice(0, 80)}・自信 ${Math.round(c * 100)}%・税込 ${Math.round(a.price)}円`,
          sig: `ai:${a.price}:${a.qty}:${unit}`, updatedAt: FieldValue.serverTimestamp(),
        };
        w.set(db.doc(`${COL}/ai_${g.id}`), s);
        made++;
      });
      await w.commit();
    } catch (e) {
      console.warn("参考価格の推定に失敗", String((e as Error)?.message ?? e));
    }
  }
  // AIの原価は aiRequests だけに残す（お店の記録には出さない）
  await db.collection("aiRequests").add({ kind: "estimateRefPrices", by: uid, usage, costYen: costYen(usage), model: GEMINI_MODEL, at: FieldValue.serverTimestamp() });
  return { made, checked: targets.length };
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
