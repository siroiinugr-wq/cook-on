// データの整理（取り込んだあとの見直し）で使う判定。画面の「データの整理」とサーバーの tidy 関数が同じここを読む。
// - 名前のないレシピ・レシピでないもの
// - 何個分か入っていないレシピ（1ロット＝1個のまま、材料が重い）
// - 同じレシピの中で同じ材料が何行かに分かれている
// - 材料の表記ゆれ（きび砂糖／キビ糖など）
import { toMatchKey, bigrams, dice } from "./matchKey";
import type { RecipeItem } from "./types";

/** 取り込みで名前が読めなかったときの名前・仮の名前 */
export function isPlaceholderName(name: string): boolean {
  const s = name.normalize("NFKC").replace(/\s/g, "");
  return !s || /^(名前のないレシピ|無題|untitled|新しいレシピ|レシピ\d*|recipe\d*|no\.?\d+|\d+)$/i.test(s);
}

/** レシピではなさそう（材料の行が1つ以下、または「データ」「一覧」などの名前） */
export function looksNotRecipe(r: { name: string; items: RecipeItem[]; steps: unknown[] }): boolean {
  const withQty = r.items.filter((i) => i.qty !== null && i.qty > 0).length;
  if (/データ|一覧|リスト|価格表|原価表|メモ$|まとめ/.test(r.name)) return true;
  return withQty <= 1 && r.steps.length === 0;
}

/** 名前・メモ・工程の文から「何個分」を探す（2以上のときだけ）。取り込みで AI が読めなかったときの予備 */
export function guessPieces(texts: string[]): number | null {
  const s = texts.join(" ").normalize("NFKC");
  const re = /(?:約|およそ)?\s*(\d{1,4})\s*(?:個|枚|本|切れ|カット|ピース|pcs|コ|ヶ|人分|個分|枚分|本分|切れ分|人前)/gi;
  for (const m of s.matchAll(re)) {
    const n = Number(m[1]);
    if (n >= 2 && n <= 2000) return n;
  }
  return null;
}

/** 1ロット＝1個のままで材料が重い（150g 以上）レシピは、何個分かが入っていない見込み */
export const HEAVY_SINGLE_GRAMS = 150;

/** 何個分かを入れてほしいレシピか（ドリンクは1杯＝1個が普通なので外す） */
export function needsPieces(r: { category?: string; subcategory?: string; yield?: { pieces?: number } }, grams: number): boolean {
  if ((r.yield?.pieces ?? 1) !== 1 || grams < HEAVY_SINGLE_GRAMS) return false;
  return !/ドリンク|飲み物|飲料|コーヒー|珈琲|ティー|紅茶|ラテ|スムージー|ジュース/.test(`${r.category ?? ""}${r.subcategory ?? ""}`);
}

// ── 同じレシピの中の重なり ──

const itemKey = (it: RecipeItem) => `${it.ingredientId ?? `name:${toMatchKey(it.name)}`}|${it.unit}`;

/** 同じ材料・同じ単位の行が2つ以上あるもの（材料名の一覧） */
export function duplicateItems(items: RecipeItem[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const it of items) {
    if (!it.ingredientId && !toMatchKey(it.name)) continue;
    const k = itemKey(it);
    const c = count.get(k);
    if (c) c.n++;
    else count.set(k, { name: it.name, n: 1 });
  }
  return [...count.values()].filter((c) => c.n > 1).map((c) => c.name);
}

/** 同じ材料・同じ単位の行を、最初の行の場所に1つにまとめる（量は足し、メモはつなぐ） */
export function mergeDuplicateItems(items: RecipeItem[]): RecipeItem[] {
  const out: RecipeItem[] = [];
  const at = new Map<string, number>();
  for (const it of items) {
    const k = itemKey(it);
    const i = at.get(k);
    if (i === undefined || (!it.ingredientId && !toMatchKey(it.name))) {
      at.set(k, out.length);
      out.push({ ...it });
      continue;
    }
    const cur = out[i];
    const qty = cur.qty === null && it.qty === null ? null : Math.round(((cur.qty ?? 0) + (it.qty ?? 0)) * 100) / 100;
    const notes = [cur.note, it.note].filter((n): n is string => !!n && !n.startsWith("元の表記"));
    out[i] = { ...cur, qty, ...(notes.length ? { note: [...new Set(notes)].join("／").slice(0, 60) } : {}) };
  }
  return out;
}

// ── 材料の表記ゆれ ──

// 読みが違っても同じものになる書き方（照合キーのあとにかける。照合キーはひらがなをカタカナにしている）
const SYNONYMS: [RegExp, string][] = [
  [/砂糖/g, "糖"], [/無花果/g, "イチジク"], [/苺/g, "イチゴ"], [/胡麻/g, "ゴマ"], [/林檎/g, "リンゴ"], [/胡桃/g, "クルミ"],
  [/蜂蜜/g, "ハチミツ"], [/玉子|鶏卵/g, "卵"], [/抹茶粉/g, "抹茶"], [/チョコレート/g, "チョコ"],
  [/(.{3,})チーズ$/g, "$1"], [/プードル/g, "パウダー"], [/ピューレ|ピュレ|ピュー?レー/g, "ピュレ"],
  // 長音は最後に外す（ピューレ／ピュレ）
  [/ー/g, ""],
];

/** 表記ゆれを比べるための形 */
export function canonicalName(name: string): string {
  let k = toMatchKey(name);
  for (const [re, to] of SYNONYMS) k = k.replace(re, to);
  return k;
}

// 1文字だけ違っても別のものになる字（無塩／有塩、卵黄／卵白、薄力／強力、35%／47% など）
const CONTRAST = new Set("無有黄白強薄中準黒赤青緑生乾粗細冷温甘辛上下大小新旧粒粉片丸板生焼0123456789".split(""));
// 大白／太白のような書き間違いは拾いたいので「大」は別扱い（太・大どちらかだけの違いは同じとみなす）
const TYPO_PAIRS = [["大", "太"]];

function onlyContrast(a: string, b: string): boolean {
  const A = new Set(a);
  const B = new Set(b);
  const da = [...A].filter((c) => !B.has(c));
  const db = [...B].filter((c) => !A.has(c));
  if (!da.length && !db.length) return false;
  if (da.length === 1 && db.length === 1 && TYPO_PAIRS.some(([x, y]) => (da[0] === x && db[0] === y) || (da[0] === y && db[0] === x))) return false;
  return [...da, ...db].every((c) => CONTRAST.has(c));
}

/** 同じものらしい2つの材料名か */
export function sameIngredient(a: string, b: string): boolean {
  const x = canonicalName(a);
  const y = canonicalName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (onlyContrast(x, y)) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  if (s.length >= 3 && l.includes(s) && s.length / l.length >= 0.6) return true;
  return s.length >= 3 && dice(bigrams(x), bigrams(y)) >= 0.75;
}

/** 表記ゆれのまとまり（2つ以上の材料の id）。よく使うほうを先にするのは呼ぶ側 */
export function similarIngredientGroups<T extends { id: string; name: string }>(list: T[]): T[][] {
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (sameIngredient(list[i].name, list[j].name)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, T[]>();
  list.forEach((x, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}
