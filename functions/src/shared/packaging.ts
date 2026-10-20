// 包装資材（袋・脱酸素剤・シール）と包装セットの原価。レシピには「1個あたり」で付ける
// 画面の表示とサーバーの原価（saveRecipe・原価アラート）が同じ計算を使う。値段はいつも税抜で持つ

import type { PackagingMaterial, PackagingSet, RecipePackLine } from "./types";

export const PACK_LIMITS = { name: 60, setItems: 20, lines: 10, memo: 300 } as const;

/** 資材とセットを id で引ける形にまとめたもの（原価の計算に渡す） */
export interface PackCtx {
  matById: Map<string, PackagingMaterial>;
  setById: Map<string, PackagingSet>;
}
export const EMPTY_PACK: PackCtx = { matById: new Map(), setById: new Map() };

/** 資材1枚（1個・1本・1m）の値段。仕入れ値が無いときは null */
export function packUnitCost(m: Pick<PackagingMaterial, "purchasePrice" | "purchaseQty">): number | null {
  const price = m.purchasePrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  return m.purchaseQty > 0 ? price / m.purchaseQty : null;
}

/** セット1つの値段。中身に値段の無い資材があれば missing に数える（その分は入っていない） */
export function setCost(set: Pick<PackagingSet, "items">, matById: Map<string, PackagingMaterial>): { cost: number; missing: number } {
  let cost = 0;
  let missing = 0;
  for (const it of set.items) {
    const m = matById.get(it.packagingId);
    const unit = m ? packUnitCost(m) : null;
    if (unit === null) missing += 1;
    else cost += unit * it.qty;
  }
  return { cost, missing };
}

export interface PackCostLine {
  cost: number | null;
  /** セットの中で値段が無い資材の数（行の値段は分かった分だけ） */
  missing: number;
}
export interface PackCostResult {
  lines: PackCostLine[];
  /** 1個あたりの包装の値段 */
  perPiece: number;
  /** 計算に入らなかった資材の数 */
  missing: number;
}

/** レシピの包装（1個あたり）の値段 */
export function calcPackaging(lines: RecipePackLine[] | undefined, ctx: PackCtx): PackCostResult {
  let perPiece = 0;
  let missing = 0;
  const out = (lines ?? []).map((l): PackCostLine => {
    if (l.kind === "set") {
      const set = l.refId ? ctx.setById.get(l.refId) : undefined;
      if (!set) { missing += 1; return { cost: null, missing: 1 }; }
      const c = setCost(set, ctx.matById);
      perPiece += c.cost * l.qty;
      missing += c.missing;
      return { cost: c.cost * l.qty, missing: c.missing };
    }
    const m = l.refId ? ctx.matById.get(l.refId) : undefined;
    const unit = m ? packUnitCost(m) : null;
    if (unit === null) { missing += 1; return { cost: null, missing: 1 }; }
    perPiece += unit * l.qty;
    return { cost: unit * l.qty, missing: 0 };
  });
  return { lines: out, perPiece, missing };
}

/** レシピが使っている資材（セットの中身も）とセットの id。値段やセットが変わったときに探すための列 */
export function packagingRefs(lines: RecipePackLine[] | undefined, ctx: PackCtx): { packagingIds: string[]; packagingSetIds: string[] } {
  const mats = new Set<string>();
  const sets = new Set<string>();
  for (const l of lines ?? []) {
    if (!l.refId) continue;
    if (l.kind === "item") mats.add(l.refId);
    else {
      sets.add(l.refId);
      for (const it of ctx.setById.get(l.refId)?.items ?? []) mats.add(it.packagingId);
    }
  }
  return { packagingIds: [...mats], packagingSetIds: [...sets] };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 画面から来たレシピの包装を整える（形・数・長さ）。中身の無い行は捨てる */
export function sanitizePackLines(raw: unknown): RecipePackLine[] {
  return (Array.isArray(raw) ? raw : []).slice(0, PACK_LIMITS.lines).map((x): RecipePackLine => {
    const l = (x ?? {}) as Record<string, unknown>;
    const qty = typeof l.qty === "number" && Number.isFinite(l.qty) && l.qty > 0 ? Math.min(l.qty, 1000) : 1;
    return {
      kind: l.kind === "set" ? "set" : "item",
      refId: typeof l.refId === "string" && l.refId ? l.refId : null,
      name: str(l.name, PACK_LIMITS.name),
      qty,
    };
  }).filter((l) => l.refId || l.name);
}

/** 包装の1行を短い文にする（「10cm袋セット×1」） */
export function packLineText(l: RecipePackLine): string {
  return l.qty === 1 ? l.name : `${l.name}×${Math.round(l.qty * 100) / 100}`;
}
