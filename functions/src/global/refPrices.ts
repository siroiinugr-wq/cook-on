// 仕入れ値が空の材料に、値段を自動で入れる。
// - onGlobalRefPrice：共有の材料に参考価格が入った・変わったら、結んでいるお店の材料のうち仕入れ値が空（か参考価格のまま）のものに入れる（無料）
// - fillPricesFromWeb：お店が押すと、仕入れ値が空の材料を (1) 共有の参考価格で入れ（無料）、(2) 残りを Google 検索つきのAIが1品ずつ調べて入れる
//   （PRICE_SEARCH_BATCH 品で1クレジット priceSearch）。どちらも「参考価格」の印を付け、お店が値段を入れ直すと消える。
//   ネットの値段は、結んでいる共有の材料に参考価格が無ければ運営の精査画面への提案にもする（採用されるとほかのお店にも入る）
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { PRICE_SEARCH_BATCH, PRICE_SEARCH_MAX } from "../shared/credits";
import { refPricePatch } from "../shared/link";
import { refPriceExTax } from "../shared/refPrice";
import type { GlobalIngredient, Ingredient } from "../shared/types";
import { GEMINI_API_KEY, REGION } from "../ai/config";
import { addUsage, type Usage } from "../ai/gemini";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { searchRefPrice, webPriceSuggestion } from "./suggestions";

const SEARCH_PARALLEL = 4;
/** ネットの値段を入れる自信の下限（これより低ければ入れない） */
const MIN_CONFIDENCE = 0.5;

const samePrice = (a?: GlobalIngredient["refPrice"], b?: GlobalIngredient["refPrice"]) =>
  !!a && !!b && a.price === b.price && a.qty === b.qty && a.unit === b.unit;

export const onGlobalRefPrice = onDocumentWritten({ document: "globalIngredients/{id}", region: REGION }, async (event) => {
  const after = event.data?.after.data() as GlobalIngredient | undefined;
  const before = event.data?.before.data() as GlobalIngredient | undefined;
  if (!after?.refPrice || samePrice(after.refPrice, before?.refPrice)) return;
  const snap = await getFirestore().collectionGroup("ingredients").where("globalRef", "==", event.params.id).get();
  const writes = snap.docs.flatMap((d) => {
    const ing = d.data() as Ingredient;
    // お店が入れた値段は変えない。参考価格のままなら新しい参考価格に入れ替える
    if (ing.purchasePrice !== null && ing.priceSource !== "ref") return [];
    const p = refPricePatch({ purchasePrice: null }, after);
    // ネットで調べた値段の記録（refWeb）は消さずに残す
    return Object.keys(p).length ? [d.ref.update(p)] : [];
  });
  await Promise.all(writes);
  if (writes.length) console.log("参考価格をお店の材料に入れました", event.params.id, writes.length);
});

export const fillPricesFromWeb = onCall({ region: REGION, timeoutSeconds: 300, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const db = getFirestore();
  const col = db.collection(`organizations/${orgId}/ingredients`);
  const empty = (await col.where("purchasePrice", "==", null).get()).docs.map((d) => ({ ...(d.data() as Ingredient), id: d.id }));
  if (!empty.length) return { free: 0, filled: 0, tried: 0, left: 0 };

  // (1) 共有の材料に参考価格があれば、それを入れる（無料）
  const refs = [...new Set(empty.map((i) => i.globalRef).filter((x): x is string => !!x))];
  const globals = new Map((await Promise.all(refs.map((id) => db.doc(`globalIngredients/${id}`).get())))
    .filter((s) => s.exists).map((s) => [s.id, { ...(s.data() as GlobalIngredient), id: s.id }]));
  let free = 0;
  const rest: Ingredient[] = [];
  for (const i of empty) {
    const p = i.globalRef ? refPricePatch(i, globals.get(i.globalRef)) : {};
    if (Object.keys(p).length) { await col.doc(i.id).update(p); free++; } else rest.push(i);
  }
  // (2) 残りは Google 検索つきのAIで1品ずつ（食材でない・見つからないものは入れない）
  const todo = rest.slice(0, PRICE_SEARCH_MAX);
  if (!todo.length) return { free, filled: 0, tried: 0, left: 0 };
  const pending = await db.collection("globalSuggestions").where("source", "==", "ai").where("status", "==", "pending").get();
  const waiting = new Set(pending.docs.map((d) => String(d.get("globalId"))));

  return runWithCredits({ orgId, uid, action: "priceSearch", units: Math.ceil(todo.length / PRICE_SEARCH_BATCH), requestId }, async () => {
    let usage: Usage = { in: 0, out: 0 };
    let ok = 0;
    let filled = 0;
    for (let k = 0; k < todo.length; k += SEARCH_PARALLEL) {
      await Promise.all(todo.slice(k, k + SEARCH_PARALLEL).map(async (i) => {
        try {
          const g = i.globalRef ? globals.get(i.globalRef) : undefined;
          const r = await searchRefPrice({ name: g?.name ?? i.name, aliases: [...(g && g.name !== i.name ? [i.name] : []), ...(i.aliases ?? [])], category: g?.category }, MIN_CONFIDENCE);
          usage = addUsage(usage, r.usage);
          ok++;
          const w = r.found;
          if (!w) return;
          // 調べている間にお店が値段を入れていたら変えない
          const cur = await col.doc(i.id).get();
          if (!cur.exists || cur.get("purchasePrice") !== null) return;
          const exPrice = refPriceExTax(w);
          await col.doc(i.id).update({
            purchasePrice: exPrice, priceTax: 0, purchaseQty: w.qty, purchaseUnit: w.unit, priceSource: "ref",
            // 調べた日・税込の値段・量も残す（お店が仕入れ値を直しても、この記録は消さない）
            refWeb: { note: `${w.basis}${w.n ? `・${w.n}店` : ""}・税込${Math.round(w.price)}円`, sources: w.sources, searchHtml: w.searchHtml, at: new Date().toISOString(), price: Math.round(w.price), qty: w.qty, unit: w.unit, exPrice },
          });
          filled++;
          // 共有の材料に参考価格が無ければ、運営の精査画面に提案する（採用されるとほかのお店にも入る）
          if (g && !g.refPrice && !waiting.has(g.id)) {
            waiting.add(g.id);
            await db.doc(`globalSuggestions/ai_${g.id}`).set(webPriceSuggestion(g, w));
          }
        } catch (e) {
          console.warn("仕入れ値の検索に失敗", orgId, i.id, String((e as Error)?.message ?? e));
        }
      }));
    }
    if (!ok) throw new HttpsError("internal", "ネットで調べられませんでした。クレジットは使われていません。");
    return { result: { free, filled, tried: ok, left: rest.length - todo.length }, usage, usedUnits: Math.ceil(ok / PRICE_SEARCH_BATCH) };
  });
});
