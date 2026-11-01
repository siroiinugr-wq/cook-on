// レシート・納品書から読んだ明細（ai/invoices.ts）を、お店の材料の仕入れ値に直す。画面（確かめて反映）とテストで使う。
import { toExTax } from "./cost";
import type { Ingredient } from "./types";
import type { Unit } from "./units";

export const INVOICE_UNITS: Unit[] = ["g", "kg", "ml", "l", "個", "枚", "本"];

/** 読み取った明細1行 */
export interface InvoiceLine {
  /** 写真の何枚目か（0始まり） */
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
