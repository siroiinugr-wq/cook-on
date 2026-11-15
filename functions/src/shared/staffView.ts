// スタッフ用の写し（値段を抜いたレシピと材料）。Firestore は1つの文書の一部の項目だけを隠せないので、
// オーナー・管理者だけが元の recipes / ingredients を読み、スタッフと「見るだけ」はこの写しを読む（firestore.rules）。
// 写しを作るのは Functions のトリガ（staff/mirror.ts）だけ。画面は useOrgCtx().seeMoney で読む場所を選ぶ（lib/paths.ts）

/** スタッフに見せない材料の項目（仕入れ値・税の形・参考価格の印・ネットの値段・比べた結果・仕入れ先） */
export const INGREDIENT_MONEY_KEYS = ["purchasePrice", "priceTax", "priceSource", "refWeb", "offers", "supplier"] as const;
/** スタッフに見せないレシピの項目（売価・目標原価率・原価・包装） */
export const RECIPE_MONEY_KEYS = ["sellingPrice", "targetCostRate", "costCache", "packaging", "packagingIds", "packagingSetIds"] as const;

/** スタッフがレシピを保存したとき、今のレシピから引き継ぐ項目（画面の写しには無いので、消さないように） */
export const RECIPE_KEEP_ON_STAFF_SAVE = ["sellingPrice", "targetCostRate", "packaging"] as const;

export const STAFF_RECIPES = "staffRecipes";
export const STAFF_INGREDIENTS = "staffIngredients";

function strip(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!keys.includes(k)) out[k] = v;
  return out;
}

export const staffRecipe = (d: Record<string, unknown>) => strip(d, RECIPE_MONEY_KEYS);
export const staffIngredient = (d: Record<string, unknown>) => strip(d, INGREDIENT_MONEY_KEYS);
