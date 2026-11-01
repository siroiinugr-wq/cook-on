// ネットで見つけた材料の売り場（AIが Google 検索で探す。ai/compare.ts の compareWebPrices）。画面とテストで同じ計算を使う。
// 値段は税込（ネットの表示どおり）。送料・まとめ買いの条件はサイトごとに違うので、画面では「目安」として出す
import { toExTax } from "./cost";
import { per100 } from "./invoice";
import type { Ingredient } from "./types";
import type { Unit } from "./units";

export interface WebOffer {
  shop: string;
  product: string;
  /** 税込の値段（円。送料は含めない） */
  price: number;
  qty: number;
  unit: Unit;
  /** 売り場のページ（検索で見たページ。見つからなければ null） */
  url: string | null;
  /** 送料・まとめ買いの条件など */
  note: string;
}

/** 材料に残す比べた結果。picked は選んだ候補（list の番号）。past は前に調べた結果（新しい順、OFFER_PAST_MAX 回まで） */
export interface WebOffers {
  list: WebOffer[];
  at: string;
  searchHtml: string;
  picked?: number | null;
  past?: PastOffers[];
}

/** 前に調べた結果（検索の候補 searchHtml は大きいので残さない。見たページは各売り場の url に残る） */
export interface PastOffers {
  list: WebOffer[];
  at: string;
  picked?: number | null;
}

export const OFFER_PAST_MAX = 5;

/** もう一度調べたとき：今の結果を past の先頭に移して、新しい結果にする */
export function withPast(next: Omit<WebOffers, "past">, prev: WebOffers | null | undefined): WebOffers {
  const past = prev?.list?.length ? [{ list: prev.list, at: prev.at, picked: prev.picked ?? null }, ...(prev.past ?? [])] : prev?.past ?? [];
  return { ...next, past: past.slice(0, OFFER_PAST_MAX) };
}

/** AIがネットで調べた値段の記録（材料の refWeb）。古い記録は note・sources・searchHtml だけ */
export interface RefWeb {
  note: string;
  sources: { uri: string; title: string }[];
  searchHtml: string;
  /** 調べた日時（ISO） */
  at?: string;
  /** 税込の値段（円）と量 */
  price?: number;
  qty?: number;
  unit?: Unit;
  /** 入れた税抜の値段（いまの仕入れ値がこの値段のままか見分けるため） */
  exPrice?: number;
}

/** いまの仕入れ値が、AIがネットで調べた値段のままか（古い記録は「参考価格のまま」で見分ける） */
export function webPriceInUse(ing: Pick<Ingredient, "purchasePrice" | "priceSource" | "refWeb">): boolean {
  const w = ing.refWeb;
  if (!w || ing.priceSource !== "ref" || ing.purchasePrice === null) return false;
  return w.exPrice === undefined || Math.abs(w.exPrice - ing.purchasePrice) < 0.5;
}

/** 食品の値段なので税込8%として税抜に直す */
export const OFFER_TAX = 0.08;

export interface RankedOffer extends WebOffer {
  /** 元の list の番号 */
  index: number;
  /** 100gあたりの税抜の値段（量が個・枚・本で1つの重さが分からなければ null） */
  per100: number | null;
  /** 今の仕入れ値の100gあたりとの差（%。今の値段が無ければ null） */
  diff: number | null;
}

/** 100gあたりの安い順に並べ、今の仕入れ値（レシートで入れた値段）と比べる。100gあたりが出せないものは後ろ */
export function rankOffers(list: WebOffer[], ing: Pick<Ingredient, "purchasePrice" | "purchaseQty" | "purchaseUnit" | "gramsPerPiece">): RankedOffer[] {
  const now = ing.purchasePrice !== null ? per100(ing.purchasePrice, 0, ing.purchaseQty, ing.purchaseUnit, ing.gramsPerPiece) : null;
  return list
    .map((o, index) => {
      const p = per100(o.price, OFFER_TAX, o.qty, o.unit, ing.gramsPerPiece);
      return { ...o, index, per100: p, diff: p !== null && now ? Math.round(((p - now) / now) * 100) : null };
    })
    .sort((a, b) => (a.per100 ?? Infinity) - (b.per100 ?? Infinity));
}

/** 見つかった中でいちばん安い100gあたり（税抜）。無ければ null */
export function cheapestPer100(o: WebOffers | null | undefined, gramsPerPiece?: number | null): number | null {
  const xs = (o?.list ?? []).map((x) => per100(x.price, OFFER_TAX, x.qty, x.unit, gramsPerPiece)).filter((x): x is number => x !== null);
  return xs.length ? Math.min(...xs) : null;
}

/** 選んだ売り場を仕入れ値にするときの書き換え（税込8%で入れた印を残す） */
export function offerPatch(o: WebOffer): Partial<Ingredient> {
  return { purchasePrice: toExTax(o.price, OFFER_TAX), priceTax: OFFER_TAX, purchaseQty: o.qty, purchaseUnit: o.unit, priceSource: null, supplier: o.shop.slice(0, 60) };
}
