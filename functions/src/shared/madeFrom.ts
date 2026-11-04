// 自家製の材料（タルト生地・クレームダマンド・クランブルなど）を、それを作るレシピに結ぶ（Ingredient.madeFrom）。
// 結ぶと、材料の値段（レシピの材料の合計を、材料の合計の重さで割る）とアレルゲン（レシピの材料のアレルゲン）がレシピから入る。
// レシピを直す・レシピの材料の値段が変わると、サーバー（recipes/madeFrom.ts の syncMadeFrom）が入れ直す。
import { sortAllergens } from "./allergens";
import { calcCost, round2 } from "./cost";
import { toMatchKey } from "./matchKey";
import type { Ingredient, RecipeItem } from "./types";
import { toGrams } from "./units";

export type MadeFromPatch = Pick<Ingredient, "allergens" | "allergensConfirmed" | "purchasePrice" | "purchaseQty" | "purchaseUnit" | "priceTax" | "priceSource">
  & Partial<Pick<Ingredient, "nutrition" | "nutritionMissing">>;

/** 材料の100gあたりの成分（kcal・protein・fat・carbohydrate・salt）。自家製なら材料の nutrition、ほかは結んだ共有の材料（成分表）から */
export type NutritionOf = (ing: Ingredient) => Record<string, number> | null | undefined;

/**
 * 中身の材料の成分（100gあたり）から、自家製の材料の100gあたりの成分を出す。
 * 重さは値段と同じく「材料の合計の重さ」（焼く・煮詰めるで減る分は見ない）。成分の分からない行は 0 として足し、行数を missing に返す
 */
export function madeFromNutrition(items: RecipeItem[], ingById: Map<string, Ingredient>, nutOf: NutritionOf): { nutrition: Record<string, number> | null; missing: number } {
  const sum: Record<string, number> = {};
  let grams = 0;
  let missing = 0;
  let known = 0;
  for (const it of items) {
    if (!it.name.trim() || it.unit === "適量") continue;
    const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined;
    const g = toGrams(it.qty, it.unit, ing ?? {});
    if (g === null || g <= 0) { missing += 1; continue; }
    grams += g;
    const n = ing ? nutOf(ing) : null;
    const keys = n ? Object.keys(n).filter((k) => typeof n[k] === "number" && Number.isFinite(n[k])) : [];
    if (!n || !keys.length) { missing += 1; continue; }
    known += 1;
    for (const k of keys) sum[k] = (sum[k] ?? 0) + (n[k] * g) / 100;
  }
  if (!known || grams <= 0) return { nutrition: null, missing };
  return { nutrition: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round((v / grams) * 100 * 100) / 100])), missing };
}

/**
 * レシピから、自家製の材料に入れる値。値段は材料の値段がそろっているときだけ（足りなければ null＝計算に入らない）。
 * nutOf を渡すと成分（100gあたり）も入れる（サーバーが共有の材料の成分を読んで渡す。画面は値段とアレルゲンだけ）
 */
export function madeFromPatch(items: RecipeItem[], ingById: Map<string, Ingredient>, nutOf?: NutritionOf): MadeFromPatch & { missing: number } {
  const r = calcCost(items, ingById);
  const ids = [...new Set(items.map((i) => i.ingredientId).filter((x): x is string => !!x))];
  const allergens = sortAllergens(ids.flatMap((id) => ingById.get(id)?.allergens ?? []));
  // 中身の材料がすべて結ばれて、すべてアレルゲンを確かめてあれば「確認済み」
  const confirmed = items.every((it) => !it.name.trim() || (!!it.ingredientId && ingById.get(it.ingredientId)?.allergensConfirmed === true));
  const grams = Math.round(r.totalGrams);
  return {
    allergens,
    allergensConfirmed: confirmed,
    purchasePrice: r.missing === 0 && grams > 0 ? round2(r.total) : null,
    purchaseQty: grams > 0 ? grams : 1,
    purchaseUnit: "g",
    priceTax: 0,
    priceSource: null,
    ...(nutOf ? (({ nutrition, missing }) => ({ nutrition, nutritionMissing: missing }))(madeFromNutrition(items, ingById, nutOf)) : {}),
    missing: r.missing,
  };
}

/** 今の材料の値と違うところがあるか（同じなら書かない。トリガが何度も回らないように） */
export function madeFromChanged(ing: Partial<Ingredient>, p: MadeFromPatch): boolean {
  const keys = Object.keys(p) as (keyof MadeFromPatch)[];
  return keys.some((k) => JSON.stringify(ing[k] ?? null) !== JSON.stringify(p[k] ?? null));
}

/**
 * レシピ recipeId が、材料 ingredientId を（自家製の材料をたどって）使っているか。
 * 使っていれば、その材料をそのレシピに結ぶとぐるぐる回るので結ばない
 */
export function usesIngredient(
  recipeId: string, ingredientId: string,
  recipeIngredients: Map<string, readonly string[]>, madeFromOf: Map<string, string>,
): boolean {
  const seen = new Set<string>();
  const stack = [recipeId];
  while (stack.length) {
    const rid = stack.pop()!;
    if (seen.has(rid)) continue;
    seen.add(rid);
    for (const id of recipeIngredients.get(rid) ?? []) {
      if (id === ingredientId) return true;
      const sub = madeFromOf.get(id);
      if (sub) stack.push(sub);
    }
  }
  return false;
}

/** 材料の名前と同じ名前のレシピ（自家製の材料の結び先の候補）。名前は照合キーで比べる */
export function madeFromCandidates<R extends { id: string; name: string }>(ing: { name: string; aliases?: string[] }, recipes: R[]): R[] {
  const keys = new Set([ing.name, ...(ing.aliases ?? [])].map(toMatchKey).filter(Boolean));
  const strip = (k: string) => k.replace(/^(自家製|手作り|ホームメイド)/, "");
  const loose = new Set([...keys].map(strip));
  return recipes.filter((r) => {
    const k = toMatchKey(r.name);
    return k && (keys.has(k) || loose.has(strip(k)));
  });
}

/**
 * 名前の一部が同じレシピ（「ダマンド」→「クレームダマンド」、「キャラメリゼ」→「りんごのキャラメリゼ」）。
 * 前か後ろが3文字以上そろうものだけ。仕入れる材料（バター・生クリーム）を間違えて結ばないよう、使うのは自家製らしい名前の材料だけにする
 */
export function madeFromPartial<R extends { id: string; name: string }>(ing: { name: string; aliases?: string[] }, recipes: R[]): R[] {
  const strip = (k: string) => k.replace(/^(自家製|手作り|ホームメイド)/, "");
  const keys = [...new Set([ing.name, ...(ing.aliases ?? [])].map(toMatchKey).map(strip))].filter((k) => k.length >= 3);
  if (!keys.length) return [];
  return recipes.filter((r) => {
    const k = toMatchKey(r.name);
    return k.length >= 3 && keys.some((x) => x !== k && (k.endsWith(x) || k.startsWith(x) || x.endsWith(k)));
  });
}

/** 自家製らしい名前（生地・クリームなど）。レシピに結ぶよう勧める */
export const HOMEMADE_HINT = /キャラメリゼ|コンフィ|プラリネ|グラサージュ|ナパージュ|アパレイユ|クーリ|ムース|生地|シュクレ|サブレ|ブリゼ|ダマンド|アーモンドクリーム|フランジパーヌ|カスタード|パティシエール|クランブル|シュトロイゼル|ボトム|ガナッシュ|ジェノワーズ|ビスキュイ|スポンジ|ソース|コンポート|ジャム|シロップ|クリーム|フィリング|ペースト|自家製|手作り/;
