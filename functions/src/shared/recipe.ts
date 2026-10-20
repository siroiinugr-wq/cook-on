// レシピの入力を整え、検索用の列（ingredientIds・allergens・costCache）を作る。
// 保存はサーバー（recipes/save.ts）がここを通す。画面も同じ関数で「保存したらこうなる」を見せられる。

import { sortAllergens } from "./allergens";
import { costCacheOf } from "./cost";
import { calcPackaging, EMPTY_PACK, packagingRefs, sanitizePackLines, type PackCtx } from "./packaging";
import type { Ingredient, Recipe, RecipeItem, RecipeStep } from "./types";
import { isUnit } from "./units";

export const RECIPE_LIMITS = { name: 60, items: 80, steps: 40, stepText: 400, tags: 15, tag: 20, memo: 1000 } as const;

export type RecipeInput = Pick<Recipe, "name" | "category" | "tags" | "items" | "steps" | "yield" | "sellingPrice" | "targetCostRate"> & {
  memo?: string;
  labelInfo?: Recipe["labelInfo"];
  packaging?: Recipe["packaging"];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 画面から来た値を信用せず、形と長さをそろえる。名前が無ければエラーの文を返す */
export function sanitizeRecipe(raw: unknown): RecipeInput | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name, RECIPE_LIMITS.name);
  if (!name) return "レシピ名を入れてください。";
  const items = (Array.isArray(r.items) ? r.items : []).slice(0, RECIPE_LIMITS.items).map((x): RecipeItem => {
    const it = (x ?? {}) as Record<string, unknown>;
    const qty = num(it.qty);
    return {
      ingredientId: typeof it.ingredientId === "string" && it.ingredientId ? it.ingredientId : null,
      name: str(it.name, 60),
      qty: qty !== null && qty >= 0 ? qty : null,
      unit: isUnit(it.unit) ? it.unit : "g",
      ...(str(it.note, 60) ? { note: str(it.note, 60) } : {}),
    };
  }).filter((it) => it.name || it.ingredientId);
  const steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, RECIPE_LIMITS.steps).map((x): RecipeStep => {
    const s = (x ?? {}) as Record<string, unknown>;
    return { text: str(s.text, RECIPE_LIMITS.stepText), photoPath: typeof s.photoPath === "string" ? s.photoPath : null };
  }).filter((s) => s.text || s.photoPath);
  const y = (r.yield ?? {}) as Record<string, unknown>;
  const pieces = num(y.pieces);
  const price = num(r.sellingPrice);
  const target = num(r.targetCostRate);
  return {
    name,
    category: str(r.category, 30),
    tags: [...new Set((Array.isArray(r.tags) ? r.tags : []).map((t) => str(t, RECIPE_LIMITS.tag)).filter(Boolean))].slice(0, RECIPE_LIMITS.tags),
    items,
    steps,
    yield: { pieces: pieces && pieces > 0 ? pieces : 1, gramsPerPiece: num(y.gramsPerPiece) },
    sellingPrice: price !== null && price > 0 ? price : null,
    targetCostRate: target !== null && target > 0 && target < 1 ? target : null,
    memo: str(r.memo, RECIPE_LIMITS.memo),
    packaging: sanitizePackLines(r.packaging),
    ...(r.labelInfo && typeof r.labelInfo === "object" ? { labelInfo: r.labelInfo as Recipe["labelInfo"] } : {}),
  };
}

/** 検索用の列を作る（材料・包装の逆引き・アレルギー除外・一覧の原価）。pack は店舗の包装資材とセット */
export function deriveRecipe(input: RecipeInput, ingById: Map<string, Ingredient>, pack: PackCtx = EMPTY_PACK) {
  const ingredientIds = [...new Set(input.items.map((i) => i.ingredientId).filter((x): x is string => !!x))];
  const allergens = sortAllergens(ingredientIds.flatMap((id) => ingById.get(id)?.allergens ?? []));
  const costCache = costCacheOf(input.items, ingById, input.yield.pieces, input.sellingPrice, calcPackaging(input.packaging, pack));
  return { ingredientIds, allergens, costCache, ...packagingRefs(input.packaging, pack) };
}

/** 新しく作るときの雛形（白紙のフォームを最初に見せない） */
export const RECIPE_TEMPLATES: { id: string; label: string; recipe: RecipeInput }[] = [
  {
    id: "cookie",
    label: "焼き菓子（クッキー）",
    recipe: {
      name: "バタークッキー", category: "焼き菓子", tags: ["定番"], sellingPrice: null, targetCostRate: null,
      yield: { pieces: 30, gramsPerPiece: null },
      items: [
        { ingredientId: null, name: "無塩バター", qty: 100, unit: "g" },
        { ingredientId: null, name: "グラニュー糖", qty: 60, unit: "g" },
        { ingredientId: null, name: "全卵", qty: 25, unit: "g" },
        { ingredientId: null, name: "薄力粉", qty: 180, unit: "g" },
      ],
      steps: [{ text: "バターを室温に戻し、砂糖とすり混ぜる" }, { text: "卵を少しずつ加える" }, { text: "粉を加えて混ぜ、冷やして型抜きし170℃で12分焼く" }],
    },
  },
  {
    id: "drink",
    label: "ドリンク",
    recipe: {
      name: "カフェラテ", category: "ドリンク", tags: [], sellingPrice: null, targetCostRate: null,
      yield: { pieces: 1, gramsPerPiece: null },
      items: [{ ingredientId: null, name: "コーヒー豆", qty: 18, unit: "g" }, { ingredientId: null, name: "牛乳", qty: 200, unit: "ml" }],
      steps: [{ text: "エスプレッソを抽出する" }, { text: "牛乳をスチームして注ぐ" }],
    },
  },
  {
    id: "blank",
    label: "そのほか（材料1行から）",
    recipe: {
      name: "新しいレシピ", category: "", tags: [], sellingPrice: null, targetCostRate: null,
      yield: { pieces: 1, gramsPerPiece: null }, items: [{ ingredientId: null, name: "", qty: null, unit: "g" }], steps: [],
    },
  },
];
