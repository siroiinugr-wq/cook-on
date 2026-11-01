// レシート・納品書から読んだ明細（ai/invoices.ts）を、お店の材料の仕入れ値に直す。画面（確かめて反映）とテストで使う。
import { toExTax } from "./cost";
import { buildIndex, exactMatch, rankCandidates } from "./matchKey";
import type { PurchaseLine } from "./purchaseLines";
import type { Ingredient } from "./types";
import type { Unit } from "./units";

export const INVOICE_UNITS: Unit[] = ["g", "kg", "ml", "l", "個", "枚", "本"];

/** 読み取った明細1行 */
export interface InvoiceLine {
  /** 写真の何枚目か（0始まり）。仕入れ明細ファイルから読んだ行は -1 */
  photo: number;
  /** レシートの表記 */
  raw: string;
  /** 1つの包装の値段（円。tax が 0 なら税抜、0.08・0.1 なら税込） */
  price: number;
  /** 何をいくつ買ったか（数量。値段は1つあたり） */
  count: number;
  /** 1つの包装の量と単位（1kg 袋なら 1・kg。分からなければ 1・個） */
  qty: number;
  unit: Unit;
  /** 値段に含まれている消費税（0＝税抜で書いてある） */
  tax: number;
  supplier: string;
  date: string;
  /** 結び先のお店の材料（AIが候補から選んだもの。無ければ null） */
  ingredientId: string | null;
  confidence: number;
  /** どうやって結び先を選んだか（name＝名前・別名が同じ、similar＝似た名前、ai＝AI。無ければ ai） */
  via?: "name" | "similar" | "ai";
}

/** 明細1行を、材料の仕入れ値（税抜・印は消す）に直す。量の付いた別名も覚える */
export function invoicePatch(line: Pick<InvoiceLine, "price" | "qty" | "unit" | "tax" | "supplier" | "raw">, ing: Pick<Ingredient, "name" | "aliases" | "supplier">): Partial<Ingredient> {
  const raw = line.raw.trim().slice(0, 60);
  const aliases = raw && raw !== ing.name && !(ing.aliases ?? []).includes(raw) ? [...(ing.aliases ?? []), raw].slice(-20) : ing.aliases;
  return {
    purchasePrice: toExTax(line.price, line.tax),
    priceTax: line.tax,
    purchaseQty: line.qty > 0 ? line.qty : 1,
    purchaseUnit: line.unit,
    priceSource: null,
    ...(aliases ? { aliases } : {}),
    ...(!ing.supplier && line.supplier ? { supplier: line.supplier.slice(0, 60) } : {}),
  };
}

const SIZE_UNITS: Record<string, Unit> = { kg: "kg", g: "g", ml: "ml", l: "l", "ℓ": "l", 個: "個", 枚: "枚", 本: "本" };

/** 品名に書いてある包装の量（「よつ葉バター 450g」→ 450・g、「牛乳1L」→ 1・l）。無ければ null */
export function sizeFromName(name: string): { qty: number; unit: Unit } | null {
  const s = name.normalize("NFKC").toLowerCase();
  const m = /(\d+(?:\.\d+)?)\s*(kg|ml|g|l|ℓ|個|枚|本)(?![a-z])/.exec(s);
  if (!m) return null;
  const qty = Number(m[1]);
  return qty > 0 ? { qty, unit: SIZE_UNITS[m[2]] } : null;
}

/**
 * 仕入れ明細ファイル（AI経理などが書き出したもの）の行を、確かめる画面の行に直す。無料・AIなし。
 * - 値引き・0円の行は入れない。同じ品名は一番新しい日付の値段だけ（count に何回買ったかを入れる）
 * - お店の材料の名前・別名と同じ（一般的な名前でも可）なら結ぶ。よく似た名前（0.85 以上）は自信を下げて候補にする
 */
export function fromPurchaseLines(lines: PurchaseLine[], ings: Pick<Ingredient, "id" | "name" | "aliases">[]): InvoiceLine[] {
  const index = buildIndex(ings.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] })));
  const newest = new Map<string, { line: PurchaseLine; times: number }>();
  for (const l of lines) {
    const price = l.unitPrice ?? (l.quantity ? l.amount / l.quantity : l.amount);
    if (!(price > 0) || !(l.amount > 0)) continue;
    const key = `${l.supplier}\u0000${l.name}`;
    const cur = newest.get(key);
    if (!cur) newest.set(key, { line: l, times: 1 });
    else newest.set(key, { line: l.date >= cur.line.date ? l : cur.line, times: cur.times + 1 });
  }
  return [...newest.values()]
    .sort((a, b) => b.line.date.localeCompare(a.line.date))
    .map(({ line: l, times }) => {
      const hit = exactMatch(l.name, index) ?? (l.genericName ? exactMatch(l.genericName, index) : null);
      const near = hit ? null : rankCandidates(l.genericName || l.name, index, 1)[0];
      const size = sizeFromName(l.name);
      const price = l.unitPrice ?? (l.quantity ? l.amount / l.quantity : l.amount);
      return {
        photo: -1, raw: l.name, price: Math.round(price * 100) / 100, count: times,
        qty: size?.qty ?? 1, unit: size?.unit ?? "個",
        tax: l.taxIncluded ? l.taxRate / 100 : 0,
        supplier: l.supplier, date: l.date,
        ingredientId: hit?.id ?? (near && near.score >= 0.85 ? near.id : null),
        confidence: hit ? 1 : near && near.score >= 0.85 ? near.score * 0.8 : 0,
        via: hit ? "name" as const : "similar" as const,
      };
    });
}
