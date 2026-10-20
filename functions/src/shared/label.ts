// 食品表示ラベル（裏貼り）の文を作る
// 原材料は使った重さの多い順。添加物は「／」のあとに重さ順。アレルゲンは最後にまとめて書く（一括表示）。
// 法令の細かい例外（複合原材料の5%ルールなど）は店舗が最後に確かめる前提。画面にもそう書く。

import { allergenName, sortAllergens, type AllergenId } from "./allergens";

export interface LabelLine {
  /** ラベルに出す名前（既製品は「チョコレート（砂糖、カカオマス…）」まで書ける） */
  name: string;
  grams: number | null;
  allergens: AllergenId[];
  isAdditive?: boolean;
}

export interface LabelInfo {
  /** 名称（例：焼菓子） */
  productName: string;
  /** 保存方法（例：直射日光・高温多湿を避けて保存） */
  storage: string;
  /** 製造日から何日で期限か */
  expiryDays: number;
  expiryKind: "消費期限" | "賞味期限";
  manufacturer: string;
}

export interface LabelResult {
  ingredientsText: string;
  allergens: AllergenId[];
  /** 内容量の文（「1個（45g）」） */
  contentText: string;
  /** 重さが分からず、並びが正しくないかもしれない材料 */
  unknownWeight: string[];
}

/** 同じ名前はまとめ、重い順に並べる。重さ不明（適量など）は最後に元の順で */
function ordered(lines: LabelLine[]): { name: string; grams: number | null }[] {
  const map = new Map<string, { name: string; grams: number | null; at: number }>();
  lines.forEach((l, at) => {
    const key = l.name.trim();
    if (!key) return;
    const cur = map.get(key);
    if (!cur) map.set(key, { name: key, grams: l.grams, at });
    else if (l.grams !== null) cur.grams = (cur.grams ?? 0) + l.grams;
  });
  return [...map.values()].sort((a, b) => {
    if (a.grams === null || b.grams === null) return a.grams === null && b.grams === null ? a.at - b.at : a.grams === null ? 1 : -1;
    return b.grams - a.grams || a.at - b.at;
  });
}

export function buildLabel(lines: LabelLine[], opts: { pieces: number; gramsPerPiece?: number | null; includeRecommended?: boolean }): LabelResult {
  const main = ordered(lines.filter((l) => !l.isAdditive));
  const adds = ordered(lines.filter((l) => l.isAdditive));
  const allergens = sortAllergens(lines.flatMap((l) => l.allergens));
  const shown = opts.includeRecommended === false ? allergens.filter((a) => REQUIRED.has(a)) : allergens;

  let text = main.map((x) => x.name).join("、");
  if (adds.length) text += `／${adds.map((x) => x.name).join("、")}`;
  if (shown.length) text += `、（一部に${shown.map(allergenName).join("・")}を含む）`;

  const total = lines.reduce((s, l) => s + (l.grams ?? 0), 0);
  const per = opts.gramsPerPiece || (opts.pieces > 0 ? total / opts.pieces : total);
  return {
    ingredientsText: text,
    allergens: shown,
    contentText: per > 0 ? `1個（${Math.round(per)}g）` : "1個",
    unknownWeight: [...main, ...adds].filter((x) => x.grams === null).map((x) => x.name),
  };
}

const REQUIRED = new Set<string>(["shrimp", "crab", "walnut", "wheat", "buckwheat", "egg", "milk", "peanut"]);

/** 期限の日付（製造日から n 日後）を YYYY.MM.DD で。日本時間の日付で数える */
export function expiryDate(made: Date, days: number): string {
  const jst = new Date(made.getTime() + 9 * 3600_000);
  jst.setUTCDate(jst.getUTCDate() + days);
  return jst.toISOString().slice(0, 10).replaceAll("-", ".");
}

/** よく使うラベル用紙（幅×高さ mm）。プリンターに合わせて増やす */
export const LABEL_PAPERS = [
  { id: "62x40", name: "62×40mm（ブラザー QL 長尺テープ）", w: 62, h: 40 },
  { id: "62x100", name: "62×100mm（ブラザー QL 長尺テープ）", w: 62, h: 100 },
  { id: "50x80", name: "50×80mm（感熱ロール）", w: 50, h: 80 },
  { id: "a4-12", name: "A4 12面（86.4×42.3mm）", w: 86.4, h: 42.3 },
] as const;
export type LabelPaperId = (typeof LABEL_PAPERS)[number]["id"];
