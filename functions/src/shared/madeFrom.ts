// 自家製の材料（タルト生地・クレームダマンド・クランブルなど）を、それを作るレシピに結ぶ（Ingredient.madeFrom）。
// 結ぶと、材料の値段（レシピの材料の合計を、材料の合計の重さで割る）とアレルゲン（レシピの材料のアレルゲン）がレシピから入る。
// レシピを直す・レシピの材料の値段が変わると、サーバー（recipes/madeFrom.ts の syncMadeFrom）が入れ直す。
import { sortAllergens } from "./allergens";
import { calcCost, round2 } from "./cost";
import { toMatchKey } from "./matchKey";
import type { Ingredient, RecipeItem } from "./types";

export type MadeFromPatch = Pick<Ingredient, "allergens" | "allergensConfirmed" | "purchasePrice" | "purchaseQty" | "purchaseUnit" | "priceTax" | "priceSource">;

/** レシピから、自家製の材料に入れる値。値段は材料の値段がそろっているときだけ（足りなければ null＝計算に入らない） */
export function madeFromPatch(items: RecipeItem[], ingById: Map<string, Ingredient>): MadeFromPatch & { missing: number } {
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
    missing: r.missing,
  };
}

/** 今の材料の値と違うところがあるか（同じなら書かない。トリガが何度も回らないように） */
export function madeFromChanged(ing: Partial<Ingredient>, p: MadeFromPatch): boolean {
  const keys: (keyof MadeFromPatch)[] = ["allergens", "allergensConfirmed", "purchasePrice", "purchaseQty", "purchaseUnit", "priceTax", "priceSource"];
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

/** 自家製らしい名前（生地・クリームなど）。レシピに結ぶよう勧める */
export const HOMEMADE_HINT = /生地|シュクレ|サブレ|ブリゼ|ダマンド|アーモンドクリーム|フランジパーヌ|カスタード|パティシエール|クランブル|シュトロイゼル|ボトム|ガナッシュ|ジェノワーズ|ビスキュイ|スポンジ|ソース|コンポート|ジャム|シロップ|クリーム|フィリング|ペースト|自家製|手作り/;
