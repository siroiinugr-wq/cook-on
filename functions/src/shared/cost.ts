// 原価・倍率・売価の逆算（画面の表示とサーバーの原価アラートが同じ計算を使う）
// 売価・原価率は税抜で扱う。税込は表示のときだけ TAX_RATES で計算する。

import type { CostCache, Ingredient, RecipeItem } from "./types";
import { toGrams } from "./units";

export const TAX_RATES = { takeout: 0.08, eatIn: 0.1 } as const;
/** 店舗が目標原価率を決めていないときの値 */
export const DEFAULT_TARGET_RATE = 0.3;

/** 1g あたりの単価（円）。仕入れ値が無い・換算できないときは null */
export function unitCostPerGram(ing: Pick<Ingredient, "purchasePrice" | "purchaseQty" | "purchaseUnit" | "gramsPerPiece" | "gramsPerMl">): number | null {
  const price = ing.purchasePrice;
  // null >= 0 は true になるので、数かどうかを先に確かめる
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  const g = toGrams(ing.purchaseQty, ing.purchaseUnit, ing);
  if (!g || g <= 0) return null;
  return price / g;
}

export type MissingReason = "noIngredient" | "noPrice" | "noGrams";
export interface CostLine {
  grams: number | null;
  cost: number | null;
  missing?: MissingReason;
}
export interface CostResult {
  lines: CostLine[];
  total: number;
  totalGrams: number;
  /** 計算に入らなかった行の数（「適量」は数えない） */
  missing: number;
}

/** レシピの材料ごとの g と原価。factor は倍率（2.5ロットなら 2.5） */
export function calcCost(items: RecipeItem[], ingById: Map<string, Ingredient>, factor = 1): CostResult {
  let total = 0;
  let totalGrams = 0;
  let missing = 0;
  const lines = items.map((it): CostLine => {
    const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined;
    const qty = it.qty === null ? null : it.qty * factor;
    const grams = toGrams(qty, it.unit, ing ?? {});
    if (grams !== null) totalGrams += grams;
    if (it.unit === "適量") return { grams: null, cost: null };
    if (!ing) return miss(grams, "noIngredient");
    if (grams === null) return miss(null, "noGrams");
    const perG = unitCostPerGram(ing);
    if (perG === null) return miss(grams, "noPrice");
    const cost = grams * perG;
    total += cost;
    return { grams, cost };
  });
  function miss(grams: number | null, why: MissingReason): CostLine {
    missing += 1;
    return { grams, cost: null, missing: why };
  }
  return { lines, total, totalGrams, missing };
}

/** 分量だけに倍率をかける（作業モード・倍率の表示用） */
export function scaleItems(items: RecipeItem[], factor: number): RecipeItem[] {
  return items.map((it) => ({ ...it, qty: it.qty === null ? null : it.qty * factor }));
}

/** 倍率の決め方：ロット数で（2.5ロット）／欲しい個数で（30個） */
export type ScaleMode = { kind: "lot"; lots: number } | { kind: "pieces"; pieces: number };

export function scaleFactor(mode: ScaleMode, yieldPieces: number): number {
  if (mode.kind === "lot") return mode.lots > 0 ? mode.lots : 1;
  return yieldPieces > 0 && mode.pieces > 0 ? mode.pieces / yieldPieces : 1;
}

export function costRate(cost: number, price: number | null): number | null {
  return price && price > 0 ? cost / price : null;
}

/** 目標原価率から売価（税抜）を逆算する。roundTo 円単位で切り上げ（安く付けすぎないため） */
export function suggestPrice(costPerPiece: number, targetRate: number, roundTo = 10): number {
  if (!(targetRate > 0) || !(costPerPiece > 0)) return 0;
  return Math.ceil(costPerPiece / targetRate / roundTo) * roundTo;
}

export function withTax(price: number, rate: number): number {
  return Math.floor(price * (1 + rate));
}

/** レシピに保存する原価のまとめ（一覧・アラート用） */
export function costCacheOf(
  items: RecipeItem[], ingById: Map<string, Ingredient>, pieces: number, sellingPrice: number | null, now = new Date(),
): CostCache {
  const r = calcCost(items, ingById);
  const perPiece = pieces > 0 ? r.total / pieces : r.total;
  return {
    total: round2(r.total),
    perPiece: round2(perPiece),
    rate: costRate(perPiece, sellingPrice),
    missing: r.missing,
    computedAt: now.toISOString(),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function yen(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("ja-JP")}円`;
}

export function percent(r: number | null | undefined): string {
  return r === null || r === undefined ? "—" : `${(r * 100).toFixed(1)}%`;
}
