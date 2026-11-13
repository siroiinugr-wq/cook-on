// レシピの栄養成分（1個あたり・100gあたり）。材料の100gあたりの成分 × 使った重さ を足して、できあがりの個数で割る。
// 焼くと水分が飛んで軽くなるが、成分の合計は変わらないので「1個あたり」は合計÷個数で出す（100gあたりは、1個の重さが入っていればそれで割る）。
// 成分表からの計算なので、ラベルには「推定値」と書く（食品表示基準：分析していない値はその旨を書く）
import type { Ingredient, RecipeItem } from "./types";
import { toGrams } from "./units";

export const LABEL_NUTRIENTS = ["kcal", "protein", "fat", "carbohydrate", "salt"] as const;
export type NutrientKey = (typeof LABEL_NUTRIENTS)[number];
export const LABEL_NUTRIENT_NAMES: Record<NutrientKey, string> = { kcal: "熱量", protein: "たんぱく質", fat: "脂質", carbohydrate: "炭水化物", salt: "食塩相当量" };

export type NutritionOf = (ing: Ingredient) => Record<string, number> | null | undefined;

export interface RecipeNutrition {
  /** 1個あたり（個数が無いレシピは全量） */
  perPiece: Record<NutrientKey, number> | null;
  /** 100gあたり */
  per100: Record<NutrientKey, number> | null;
  /** 1個の重さ(g)。レシピに入れた値、無ければ材料の合計÷個数 */
  gramsPerPiece: number | null;
  /** 成分か重さが分からず、0 として数えた材料の名前 */
  missing: string[];
  /** そのうち、お店の材料に結んであるもの（材料の編集で成分を入れられる） */
  missingIngs: { id: string; name: string }[];
}

export function recipeNutrition(
  items: RecipeItem[], ingById: Map<string, Ingredient>, nutOf: NutritionOf,
  y: { pieces?: number | null; gramsPerPiece?: number | null },
): RecipeNutrition {
  const sum = Object.fromEntries(LABEL_NUTRIENTS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  const missing: string[] = [];
  const missingIngs: { id: string; name: string }[] = [];
  let grams = 0;
  let known = 0;
  for (const it of items) {
    if (!it.name.trim() || it.unit === "適量") continue;
    const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined;
    const g = toGrams(it.qty, it.unit, ing ?? {});
    const n = ing ? nutOf(ing) : null;
    if (g !== null && g > 0) grams += g;
    if (g === null || g <= 0 || !n || typeof n.kcal !== "number") {
      if (!missing.includes(it.name)) missing.push(it.name);
      if (ing && !missingIngs.some((m) => m.id === ing.id)) missingIngs.push({ id: ing.id, name: ing.name });
      continue;
    }
    known += 1;
    for (const k of LABEL_NUTRIENTS) if (typeof n[k] === "number" && Number.isFinite(n[k])) sum[k] += (n[k] * g) / 100;
  }
  const pieces = y.pieces && y.pieces > 0 ? y.pieces : 1;
  const gpp = y.gramsPerPiece && y.gramsPerPiece > 0 ? y.gramsPerPiece : grams > 0 ? grams / pieces : null;
  if (!known) return { perPiece: null, per100: null, gramsPerPiece: gpp, missing, missingIngs };
  const map = (f: (v: number) => number) => Object.fromEntries(LABEL_NUTRIENTS.map((k) => [k, f(sum[k])])) as Record<NutrientKey, number>;
  return { perPiece: map((v) => v / pieces), per100: gpp ? map((v) => (v / pieces / gpp) * 100) : null, gramsPerPiece: gpp, missing, missingIngs };
}

/** 表示の丸め：熱量は整数、ほかは小数1桁（食塩相当量は1g未満なら2桁） */
export function nutrientText(k: NutrientKey, v: number): string {
  if (k === "kcal") return `${Math.round(v)}kcal`;
  const d = k === "salt" && v < 1 ? 100 : 10;
  return `${Math.round(v * d) / d}g`;
}

/** ラベルの栄養成分を何あたりで書くか（設定 settings.labelNutritionBasis。既定は100gあたり） */
export type NutritionBasis = "100g" | "piece";

/**
 * ラベルの栄養成分表示（横に並べる書き方）。「100g当たり　熱量 450kcal、…（推定値）」か「1個（45g）当たり　…」。
 * 100gあたりで1個の重さが分からないときは1個あたりで書く。
 * 成分の分からない材料が1つでもあれば出さない（少なく出た値をラベルに刷らせない）
 */
export function nutritionLabelText(n: RecipeNutrition, basis: NutritionBasis = "100g"): string | null {
  if (!n.perPiece || n.missing.length) return null;
  const use100 = basis === "100g" && !!n.per100;
  const vals = use100 ? n.per100! : n.perPiece;
  const unit = use100 ? "100g当たり" : n.gramsPerPiece ? `1個（${Math.round(n.gramsPerPiece)}g）当たり` : "1個当たり";
  return `${unit}　${LABEL_NUTRIENTS.map((k) => `${LABEL_NUTRIENT_NAMES[k]} ${nutrientText(k, vals[k])}`).join("、")}（推定値）`;
}
