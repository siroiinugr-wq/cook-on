// レシート・納品書から読んだ明細（ai/invoices.ts）を、お店の材料の仕入れ値に直す。画面（確かめて反映）とテストで使う。
import { toExTax } from "./cost";
import { buildIndex, exactMatch, rankCandidates, toMatchKey } from "./matchKey";
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
  /** AIが品名から判断した一般的な材料名（薄力粉・無塩バターなど） */
  generic?: string;
  /** お店に無い材料のとき：一般名から見つけた共有の材料（食品成分表の成分・アレルゲン・参考価格つき）。新しく登録するときに結ぶ */
  global?: { id: string; name: string; confidence: number } | null;
  /**
   * 量（qty・unit）をどう決めたか。printed＝品名に書いてある、known＝商品の決まった量をAIが知っている、
   * price＝値段からAIが推定、web＝ネット（Google 検索）で確かめた、none＝分からない（1個のまま）、edited＝人が直した。無ければ分からない扱い
   */
  size?: SizeBasis;
  /** ネットで確かめたときに見たページと、Google の「検索の候補」（画面に出すのが利用の条件） */
  sizeSources?: { uri: string; title: string }[];
  sizeSearchHtml?: string;
  /** AIが量を決めた理由（「よつ葉バター食塩不使用は通常450g」など。画面に小さく出す） */
  sizeNote?: string;
  /** 個・枚・本で買うものの1つの重さ（g。卵M＝約50g）。材料に無ければ反映のとき写す */
  gramsPerPiece?: number | null;
}

export type SizeBasis = "printed" | "known" | "price" | "web" | "none" | "edited";
export const SIZE_BASES: SizeBasis[] = ["printed", "known", "price", "web", "none", "edited"];
/** 画面に出す「量の根拠」 */
export const SIZE_LABEL: Record<SizeBasis, string> = {
  printed: "品名に書いてある量", known: "AIの推定（商品の決まった量）", price: "AIの推定（値段から）", web: "ネットで確かめた量", none: "量が分からない", edited: "手で直した量",
};

/** 量の単位を g（ml は g とみなす）にそろえる。個・枚・本は null */
const GRAMS: Partial<Record<Unit, number>> = { g: 1, kg: 1000, ml: 1, l: 1000 };

/** 個・枚・本か */
export const isPieceUnit = (u: Unit) => !GRAMS[u];

/** 100g（100ml）あたりの税抜の値段。量が個・枚・本なら1つの重さ（gramsPerPiece）があるときだけ、無ければ null */
export function per100(price: number, tax: number, qty: number, unit: Unit, gramsPerPiece?: number | null): number | null {
  const g = GRAMS[unit] ?? (gramsPerPiece && gramsPerPiece > 0 ? gramsPerPiece : undefined);
  if (!g || !(qty > 0) || !(price > 0)) return null;
  return Math.round((toExTax(price, tax) / (qty * g)) * 100 * 10) / 10;
}

/** 明細1行を、材料の仕入れ値（税抜・印は消す）に直す。量の付いた別名も覚える */
export function invoicePatch(
  line: Pick<InvoiceLine, "price" | "qty" | "unit" | "tax" | "supplier" | "raw" | "gramsPerPiece">,
  ing: Pick<Ingredient, "name" | "aliases" | "supplier" | "gramsPerPiece">,
): Partial<Ingredient> {
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
    // 個で買う材料の1つの重さ（卵Mは約50gなど）。お店が入れた値は変えない
    ...(isPieceUnit(line.unit) && line.gramsPerPiece && line.gramsPerPiece > 0 && !ing.gramsPerPiece ? { gramsPerPiece: Math.round(line.gramsPerPiece * 10) / 10 } : {}),
  };
}

const SIZE_UNITS: Record<string, Unit> = { kg: "kg", g: "g", ml: "ml", l: "l", "ℓ": "l", 個: "個", 枚: "枚", 本: "本" };

/**
 * 品名に書いてある包装の量（「よつ葉バター 450g」→ 450・g、「牛乳1L」→ 1・l、「生クリーム200ml×3」→ 600・ml、
 * 「卵 10個入」→ 10・個、「バター 6P」→ 6・個）。無ければ null。読み違いやすい書き方はAI（量を確かめる）に任せる
 */
export function sizeFromName(name: string): { qty: number; unit: Unit } | null {
  const s = name.normalize("NFKC").toLowerCase().replace(/[×✕*]/g, "x");
  const times = (m: RegExpExecArray, at: number) => (m[at] ? Number(m[at]) : 1);
  // 数×量（3x200g）
  let m = /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|ml|g|l|ℓ)(?![a-wyz])/.exec(s);
  if (m) return { qty: Number(m[1]) * Number(m[2]), unit: SIZE_UNITS[m[3]] };
  // 量×数（200ml×3・200mlx3袋）
  m = /(\d+(?:\.\d+)?)\s*(kg|ml|g|l|ℓ)(?![a-wyz])\s*(?:x\s*(\d+))?/.exec(s);
  if (m) {
    const qty = Number(m[1]) * times(m, 3);
    return qty > 0 ? { qty: Math.round(qty * 1000) / 1000, unit: SIZE_UNITS[m[2]] } : null;
  }
  m = /(\d+)\s*(個|枚|本|p|入)(?![a-z])/.exec(s);
  if (!m) return null;
  const qty = Number(m[1]);
  return qty > 0 ? { qty, unit: m[2] === "p" || m[2] === "入" ? "個" : SIZE_UNITS[m[2]] } : null;
}

/** 100gあたりが今の材料とこれ以上違えば、量の読み違いかもしれない（倍） */
export const SIZE_SUSPECT_RATIO = 2.5;

/**
 * 量をAIに確かめてもらう理由（無ければ null）。量が分からない・個で買うのに1つの重さが分からない・
 * 今の材料の100gあたりと大きく違う（450gを1個と読んだなど）。人が直した量は確かめない
 */
export function sizeDoubt(
  l: Pick<InvoiceLine, "price" | "tax" | "qty" | "unit" | "size" | "gramsPerPiece">,
  ing?: Pick<Ingredient, "purchasePrice" | "purchaseQty" | "purchaseUnit" | "gramsPerPiece"> | null,
): string | null {
  if (l.size === "edited") return null;
  const now = per100(l.price, l.tax, l.qty, l.unit, l.gramsPerPiece ?? ing?.gramsPerPiece);
  const before = ing && ing.purchasePrice !== null ? per100(ing.purchasePrice, 0, ing.purchaseQty, ing.purchaseUnit, ing.gramsPerPiece) : null;
  if (now !== null && before) {
    const r = now / before;
    if (r > SIZE_SUSPECT_RATIO || r < 1 / SIZE_SUSPECT_RATIO) return `今の材料の100gあたり（${Math.round(before)}円）と${r > 1 ? `${Math.round(r * 10) / 10}倍` : `${Math.round((1 / r) * 10) / 10}分の1`}違う`;
  }
  if (l.size === "printed" || l.size === "known" || l.size === "price" || l.size === "web") return now === null && isPieceUnit(l.unit) ? "1つの重さが分からない" : null;
  if (l.qty === 1 && l.unit === "個") return "量が分からない";
  return now === null ? "1つの重さが分からない" : null;
}

/**
 * ネット（Google 検索つきのAI）で量を確かめる行か。AIでも決めきれなかった（値段からの推定・分からない）か、
 * 量が怪しいまま残った行。人が直した量・ネットで確かめた量・品名に書いてある量（怪しくなければ）は調べない
 */
export function needsWebSize(
  l: Pick<InvoiceLine, "price" | "tax" | "qty" | "unit" | "size" | "gramsPerPiece">,
  ing?: Pick<Ingredient, "purchasePrice" | "purchaseQty" | "purchaseUnit" | "gramsPerPiece"> | null,
): boolean {
  if (l.size === "edited" || l.size === "web") return false;
  return l.size === "price" || l.size === "none" || !l.size || !!sizeDoubt(l, ing);
}

/** 共有の「商品の量」の表のキー（品名から量・記号を除いて照合キーにしたもの） */
export function productSizeKey(name: string): string {
  return toMatchKey(name.normalize("NFKC").replace(/\d+(?:\.\d+)?\s*(kg|ml|g|l|ℓ|個|枚|本|p|入)/gi, " ")).slice(0, 120);
}

/** 共有の表の量を使ってよいか：前に調べたときの値段（税抜・1つ）と今の値段が近いとき（容量違いの商品を取り違えないため） */
export function sameSizePrice(cachedExTax: number, price: number, tax: number): boolean {
  const now = toExTax(price, tax);
  return cachedExTax > 0 && now > 0 && now / cachedExTax < 1.6 && cachedExTax / now < 1.6;
}

/** AIに量を確かめてもらうときに、品名と一緒に渡す手がかり（数量・値段・今の材料の量と値段） */
export function sizeHint(
  l: Pick<InvoiceLine, "price" | "tax" | "count" | "qty" | "unit" | "supplier" | "photo">,
  ing?: Pick<Ingredient, "name" | "purchasePrice" | "purchaseQty" | "purchaseUnit"> | null,
): string {
  const tax = l.tax ? `税込${Math.round(l.tax * 100)}%` : "税抜";
  const parts = [`1つ${Math.round(l.price)}円（${tax}）`];
  // ファイルの行の count は「何回買ったか」なので渡さない
  if (l.photo >= 0 && l.count > 1) parts.push(`数量${l.count}`);
  if (l.supplier) parts.push(`店：${l.supplier.slice(0, 20)}`);
  if (!(l.qty === 1 && l.unit === "個")) parts.push(`いまの読み：${l.qty}${l.unit}`);
  if (ing?.purchasePrice) parts.push(`お店の材料「${ing.name}」は前回 ${ing.purchaseQty}${ing.purchaseUnit}で${Math.round(ing.purchasePrice)}円（税抜）`);
  return parts.join("・");
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
        qty: size?.qty ?? 1, unit: size?.unit ?? "個", size: size ? "printed" as const : "none" as const,
        tax: l.taxIncluded ? l.taxRate / 100 : 0,
        supplier: l.supplier, date: l.date,
        ingredientId: hit?.id ?? (near && near.score >= 0.85 ? near.id : null),
        confidence: hit ? 1 : near && near.score >= 0.85 ? near.score * 0.8 : 0,
        via: hit ? "name" as const : "similar" as const,
        ...(l.genericName ? { generic: l.genericName } : {}),
      };
    });
}
