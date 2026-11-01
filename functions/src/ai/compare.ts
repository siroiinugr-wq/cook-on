// 材料1つの売り場と値段を、Google 検索つきのAIが探して比べる（1回1クレジット priceCompare）。
// 結果は材料の offers に残す（お店の画面で100gあたりの安い順に並べ、今の仕入れ値と比べる）。仕入れ値に入れるのは人が選んでから。
// 売り場のリンクは検索で見たページ（groundingChunks）からドメインで探す。Google の「検索の候補」も残して画面に出す（利用の条件）
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { INVOICE_UNITS } from "../shared/invoice";
import { withPast, type WebOffer, type WebOffers } from "../shared/offers";
import type { Ingredient } from "../shared/types";
import type { Unit } from "../shared/units";
import { GEMINI_API_KEY, REGION } from "./config";
import { callGeminiSearchJson, type WebSource } from "./gemini";
import { PRICE_COMPARE_SYSTEM, type PriceCompareAnswer } from "./prompts";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";

const MAX_OFFERS = 6;

/** AIが答えたドメインに合う、検索で見たページ（無ければ null） */
export function sourceFor(site: string, sources: WebSource[]): string | null {
  const s = site.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!s) return null;
  const hit = sources.find((x) => {
    const t = x.title.toLowerCase().replace(/^www\./, "");
    return t && (t === s || t.endsWith(`.${s}`) || s.endsWith(`.${t}`));
  });
  return hit?.uri ?? null;
}

export const compareWebPrices = onCall({ region: REGION, timeoutSeconds: 120, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const ingredientId = idOf(req.data?.ingredientId, "材料");
  const ref = getFirestore().doc(`organizations/${orgId}/ingredients/${ingredientId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "材料が見つかりません。");
  const ing = snap.data() as Ingredient;

  return runWithCredits({ orgId, uid, action: "priceCompare", units: 1, requestId }, async () => {
    const now = ing.purchasePrice !== null ? `\nお店の今の仕入れ値：${ing.purchaseQty}${ing.purchaseUnit}で${Math.round(ing.purchasePrice)}円（税抜）` : "";
    const r = await callGeminiSearchJson<PriceCompareAnswer>({
      system: PRICE_COMPARE_SYSTEM,
      prompt: `材料：${ing.name}${ing.aliases?.length ? `（別名：${ing.aliases.slice(0, 3).join("・")}）` : ""}${ing.labelName ? `\nラベルの名前：${ing.labelName.slice(0, 60)}` : ""}${now}`,
      maxOutputTokens: 2048,
    });
    const seen = new Set<string>();
    const list: WebOffer[] = (r.output?.offers ?? []).flatMap((o) => {
      const unit = String(o?.unit ?? "") as Unit;
      const shop = String(o?.shop ?? "").trim().slice(0, 40);
      const price = Number(o?.price);
      const qty = Number(o?.qty);
      if (!shop || !(price > 0) || !(qty > 0) || !INVOICE_UNITS.includes(unit)) return [];
      const key = `${shop}|${qty}${unit}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ shop, product: String(o.product ?? "").trim().slice(0, 80), price: Math.round(price), qty, unit, url: sourceFor(String(o.site ?? ""), r.sources), note: String(o.note ?? "").trim().slice(0, 30) }];
    }).slice(0, MAX_OFFERS);
    if (!list.length) throw new HttpsError("not-found", "値段の分かる売り場が見つかりませんでした。クレジットは使われていません。");
    // 前に調べた結果は past に残す（いつ・どこで・いくらだったかを、あとで比べられるように）
    const offers: WebOffers = withPast({ list, at: new Date().toISOString(), searchHtml: r.searchHtml.slice(0, 20000), picked: null }, ing.offers);
    await ref.update({ offers });
    return { result: { offers }, usage: r.usage };
  });
});
