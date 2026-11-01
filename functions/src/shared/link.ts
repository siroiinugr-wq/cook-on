// お店の材料を共有の材料に結ぶときの書き換え。画面（人が候補を選ぶ）とサーバー（relinkIngredients・confirmLinks）で同じ関数を使う。
import { sortAllergens } from "./allergens";
import { exactMatch, toMatchKey, type IndexedEntry } from "./matchKey";
import { refPriceExTax } from "./refPrice";
import type { GlobalIngredient, Ingredient } from "./types";

/** 仕入れ値が空で、共有の材料に参考価格があれば、それ（税抜）を入れて「参考価格」の印を付ける */
export function refPricePatch(ing: Pick<Ingredient, "purchasePrice">, g: Pick<GlobalIngredient, "refPrice"> | null | undefined): Partial<Ingredient> {
  const rp = g?.refPrice;
  if (ing.purchasePrice !== null || !rp || !(rp.price > 0) || !(rp.qty > 0)) return {};
  return { purchasePrice: refPriceExTax(rp), purchaseQty: rp.qty, purchaseUnit: rp.unit, priceTax: 0, priceSource: "ref" };
}

/** 結びつけ：globalRef、アレルゲンは足すだけ（足したら確認し直し）、値段が空なら参考価格 */
export function linkPatch(ing: Pick<Ingredient, "allergens" | "purchasePrice" | "priceSource">, g: Pick<GlobalIngredient, "id" | "allergens" | "refPrice">): Partial<Ingredient> {
  const allergens = sortAllergens([...(ing.allergens ?? []), ...(g.allergens ?? [])]);
  const added = allergens.length !== (ing.allergens ?? []).length;
  // 参考価格のままの材料を結び直したら、新しい結び先の参考価格に入れ替える
  return { globalRef: g.id, allergens, ...(added ? { allergensConfirmed: false } : {}), ...refPricePatch(ing.priceSource === "ref" ? { purchasePrice: null } : ing, g) };
}

/**
 * 結び先を見直したい材料：名前がほかの共有の材料とぴったり同じで、今の結び先の名前・別名には無いもの
 * （例：発酵バターが、以前の別名のせいで無塩バターに結びついている）。人が確かめてから結び直す
 */
export function misLinked<T extends Pick<Ingredient, "id" | "name" | "globalRef">>(ings: T[], index: IndexedEntry[]): { ing: T; to: IndexedEntry }[] {
  const byId = new Map(index.map((e) => [e.id, e]));
  return ings.flatMap((ing) => {
    if (!ing.globalRef) return [];
    const k = toMatchKey(ing.name);
    const cur = byId.get(ing.globalRef);
    if (!k || !cur || cur.keys.includes(k)) return [];
    const to = exactMatch(ing.name, index);
    return to && to.id !== ing.globalRef ? [{ ing, to }] : [];
  });
}
