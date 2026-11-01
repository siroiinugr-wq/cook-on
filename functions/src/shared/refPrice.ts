// 共有の材料の「参考価格」。お店ごとの仕入れ値ではなく、目安として出す値段。
// 出どころは総務省「小売物価統計調査」（店頭の値段・税込）。書くのは scripts/import-prices.mjs。
// 画面は「この値段を入れる」で税抜に直してお店の仕入れ値に写し、あとはお店が手で直す。
import { TAX_RATES } from "./cost";
import type { Unit } from "./units";

export interface RefPrice {
  /** 税込の値段（円） */
  price: number;
  qty: number;
  unit: Unit;
  /** 何の値段か（統計の品目名や銘柄） */
  item: string;
  /** どこの値段か（例：東京都区部） */
  area: string;
  /** いつの値段か（YYYY-MM） */
  asOf: string;
  source: string;
}

export const ESTAT_CREDIT = "価格の出典：総務省「小売物価統計調査」（政府統計の総合窓口 e-Stat）";

/** 店頭の値段は税込（食品は軽減税率8%）。仕入れ値は税抜で持つので割り戻す */
export function refPriceExTax(p: Pick<RefPrice, "price">): number {
  return Math.round((p.price / (1 + TAX_RATES.takeout)) * 10) / 10;
}

/**
 * 小売物価統計の品目 → はじめの材料。品目名にすべて含まれる言葉で探す。
 * e-Stat の API は品目名だけで量を返さないので、調査の「銘柄」（量の決まり）をここに書く（spec）。
 * 銘柄は調査の年で変わることがあるので、--dry-run の「値段/量」がおかしくないかを見てから書く。
 * spec が無い品目は、量が読めないので使わない（紅茶は銘柄の量が確かめられていないので外してある）。
 */
export const ESTAT_ITEM_MAP: { globalId: string; tokens: string[]; spec?: { qty: number; unit: Unit; note: string } }[] = [
  { globalId: "base_hakurikiko", tokens: ["小麦粉"], spec: { qty: 1, unit: "kg", note: "薄力粉・1kg袋入り" } },
  { globalId: "base_joohakuto", tokens: ["砂糖"], spec: { qty: 1, unit: "kg", note: "上白糖・1kg袋入り" } },
  { globalId: "base_egg", tokens: ["鶏卵"], spec: { qty: 10, unit: "個", note: "白色卵・Lサイズ・10個入りパック" } },
  { globalId: "base_milk", tokens: ["牛乳"], spec: { qty: 1000, unit: "ml", note: "紙パック入り・1000mL" } },
  { globalId: "base_butter_salted", tokens: ["バター"], spec: { qty: 200, unit: "g", note: "箱入り・200g" } },
  { globalId: "base_cream", tokens: ["生クリーム"] },
  { globalId: "base_yogurt", tokens: ["ヨーグルト"], spec: { qty: 400, unit: "g", note: "プレーン・400g" } },
  { globalId: "base_salad_oil", tokens: ["食用油"], spec: { qty: 1000, unit: "g", note: "キャノーラ油・1000g" } },
  { globalId: "base_katakuriko", tokens: ["かたくり粉"] },
  { globalId: "base_hachimitsu", tokens: ["はちみつ"] },
  { globalId: "base_salt", tokens: ["食塩"], spec: { qty: 1, unit: "kg", note: "精製塩・1kg袋入り" } },
  { globalId: "base_soy_milk", tokens: ["豆乳"], spec: { qty: 1000, unit: "ml", note: "無調整・1000mL" } },
  { globalId: "base_banana", tokens: ["バナナ"], spec: { qty: 1, unit: "kg", note: "1kg" } },
  { globalId: "base_apple", tokens: ["りんご"], spec: { qty: 1, unit: "kg", note: "ふじ又はつがる・1kg" } },
  { globalId: "base_strawberry", tokens: ["いちご"] },
  { globalId: "base_lemon", tokens: ["レモン"] },
  { globalId: "base_coffee_beans", tokens: ["コーヒー豆"], spec: { qty: 100, unit: "g", note: "炒り豆・100g" } },
  { globalId: "base_tea_leaves", tokens: ["紅茶"] },
];

const UNIT_RE = /(\d+(?:\.\d+)?)\s*(kg|g|ml|mL|L|l|リットル|個|枚|本)/;

/** 「1kg」「500g」「1000mL」「10個入り」などから量と単位を読む。読めなければ null */
export function parseQtyUnit(text: string): { qty: number; unit: Unit } | null {
  const m = text.normalize("NFKC").match(UNIT_RE);
  if (!m) return null;
  const qty = Number(m[1]);
  const u = m[2];
  const unit: Unit = u === "kg" ? "kg" : u === "g" ? "g" : /^(ml|mL)$/.test(u) ? "ml" : /^(L|l|リットル)$/.test(u) ? "l" : (u as Unit);
  return qty > 0 ? { qty, unit } : null;
}
