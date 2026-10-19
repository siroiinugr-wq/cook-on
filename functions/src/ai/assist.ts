// AIの補助（クレジット消費）
// guessProduct：メーカー名と商品名から、原材料・アレルゲン・成分の下書きを作る（1クレジット）。保存はしない
// aiSuggest：レシピについて「原価を下げる代替材料」「この材料で作れる新作」を相談する（2クレジット）
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { allergenFromName, sortAllergens } from "../shared/allergens";
import { calcCost } from "../shared/cost";
import { SUGGEST_MAX_CHARS } from "../shared/credits";
import { sanitizeRecipe } from "../shared/recipe";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { callGeminiJson } from "./gemini";
import { PRODUCT_SCHEMA, PRODUCT_SYSTEM, SUGGEST_SCHEMA, SUGGEST_SYSTEM, type ProductAnswer, type SuggestAnswer } from "./prompts";
import { loadIngredientMap } from "../recipes/save";

export const guessProduct = onCall({ region: REGION, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const maker = String(req.data?.maker ?? "").trim().slice(0, 40);
  const productName = String(req.data?.productName ?? "").trim().slice(0, 60);
  if (!maker || !productName) throw new HttpsError("invalid-argument", "メーカー名と商品名を入れてください。");
  const requestId = requestIdOf(req.data?.requestId);

  return runWithCredits({ orgId, uid, action: "productGuess", units: 1, requestId }, async () => {
    const { output, usage } = await callGeminiJson<ProductAnswer>({
      system: PRODUCT_SYSTEM, prompt: `メーカー：${maker}\n商品名：${productName}`, schema: PRODUCT_SCHEMA, maxOutputTokens: 1024,
    });
    const allergens = sortAllergens((output.allergens ?? []).map(allergenFromName).filter((a): a is NonNullable<typeof a> => !!a));
    return {
      result: {
        ingredientsText: String(output.ingredients ?? "").slice(0, 1000),
        allergens,
        nutrition: output.nutrition ?? {},
        confidence: Math.max(0, Math.min(1, Number(output.confidence) || 0)),
        note: String(output.note ?? "").slice(0, 200),
      },
      usage,
    };
  });
});

export const aiSuggest = onCall({ region: REGION, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const recipeId = idOf(req.data?.recipeId, "レシピID");
  const mode = req.data?.mode === "newRecipe" ? "newRecipe" : "costDown";
  const question = String(req.data?.question ?? "").trim().slice(0, SUGGEST_MAX_CHARS);
  const requestId = requestIdOf(req.data?.requestId);

  const snap = await getFirestore().doc(`organizations/${orgId}/recipes/${recipeId}`).get();
  const recipe = sanitizeRecipe(snap.data());
  if (!snap.exists || typeof recipe === "string") throw new HttpsError("not-found", "レシピが見つかりません。");
  const ingById = await loadIngredientMap(orgId);
  const cost = calcCost(recipe.items, ingById);

  // AIに渡すのは材料・g・円だけ（工程や店舗の情報は渡さない。入力を短くするため）
  const lines = recipe.items.map((it, i) => {
    const c = cost.lines[i];
    return `- ${it.name} ${c.grams !== null ? `${Math.round(c.grams)}g` : `${it.qty ?? ""}${it.unit}`} ${c.cost !== null ? `${Math.round(c.cost)}円` : "単価不明"}`;
  });
  const ask = mode === "costDown"
    ? `原価を5%以上下げる代替材料や配合の案を出してください。${question}`
    : `この材料を中心に作れる新しい商品の案を出してください。${question}`;
  const prompt = `レシピ：${recipe.name}（${recipe.yield.pieces}個分、原価合計${Math.round(cost.total)}円）\n${lines.join("\n")}\n\n相談：${ask}`;

  return runWithCredits({ orgId, uid, action: "aiSuggest", units: 1, requestId }, async () => {
    const { output, usage } = await callGeminiJson<SuggestAnswer>({
      system: SUGGEST_SYSTEM, prompt, schema: SUGGEST_SCHEMA, temperature: 0.6, maxOutputTokens: 2048,
    });
    return { result: { ideas: (output.ideas ?? []).slice(0, 3) }, usage };
  });
});
