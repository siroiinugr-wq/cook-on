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
  /** お店で作った材料（タルト生地など）の中身。ラベルでは「タルト生地（小麦粉、バター…）」と書き、中身の添加物は「／」のあとへ移す */
  parts?: LabelLine[];
}

export interface LabelInfo {
  /** 名称（例：焼菓子） */
  productName: string;
  /** 保存方法（例：直射日光・高温多湿を避けて保存） */
  storage: string;
  /** 製造日から何日で期限か */
  expiryDays: number;
  expiryKind: "消費期限" | "賞味期限";
  /** 製造者の名前 */
  manufacturer: string;
  /** 製造者の住所（食品表示に必要。空ならラベルを印刷させない） */
  manufacturerAddress?: string;
  /** 内容量を手で決める（「200g」「6個」など）。無ければ「1個（45g）」を計算で出す */
  content?: string;
  /** 原材料名を手で直した文と、そのときの自動の文（自動の文が変わったら「材料が変わりました」と出す） */
  ingredientsText?: string;
  ingredientsBase?: string;
  /** 期限の日付は枠の外に書く（枠の中は「枠外下部に記載」）。datePrint が false なら日付は印刷せず、スタンプや手書きで入れる */
  dateOutside?: boolean;
  datePrint?: boolean;
}

/** 枠外に日付を書くときの、枠の中の文 */
export const DATE_OUTSIDE_TEXT = "枠外下部に記載";

/** 印刷の前に足りない項目（空なら印刷してよい） */
export function labelMissing(info: LabelInfo): string[] {
  const out: string[] = [];
  if (!info.productName.trim()) out.push("名称");
  if (!info.manufacturer.trim()) out.push("製造者の名前");
  if (!(info.manufacturerAddress ?? "").trim()) out.push("製造者の住所");
  if (!(info.expiryDays > 0)) out.push("期限（製造日から何日）");
  return out;
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
function ordered(lines: { name: string; grams: number | null }[]): { name: string; grams: number | null }[] {
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

/**
 * お店で作った材料を開く：中身の原材料を「（ ）」の中へ、中身の添加物は外の添加物の列へ（重さはこの材料の重さで割り振る）。
 * 中身にさらにお店で作った材料があれば、それも同じように開く
 */
function expand(lines: LabelLine[], depth = 0): { main: { name: string; grams: number | null }[]; adds: { name: string; grams: number | null }[]; unknown: string[] } {
  const main: { name: string; grams: number | null }[] = [];
  const adds: { name: string; grams: number | null }[] = [];
  const unknown: string[] = [];
  for (const l of lines) {
    if (l.isAdditive) {
      adds.push({ name: l.name, grams: l.grams });
      if (l.grams === null) unknown.push(l.name);
      continue;
    }
    if (l.parts?.length && depth < 3) {
      const sum = l.parts.reduce((s, p) => s + (p.grams ?? 0), 0);
      const k = l.grams !== null && sum > 0 ? l.grams / sum : null;
      const scaled = l.parts.map((p) => ({ ...p, grams: p.grams !== null && k !== null ? p.grams * k : null }));
      const sub = expand(scaled, depth + 1);
      const inner = ordered(sub.main).map((x) => x.name).join("、");
      main.push({ name: inner ? `${l.name}（${inner}）` : l.name, grams: l.grams });
      adds.push(...sub.adds);
      if (l.grams === null) unknown.push(l.name);
      continue;
    }
    main.push({ name: l.name, grams: l.grams });
    if (l.grams === null) unknown.push(l.name);
  }
  return { main, adds, unknown };
}

function allergensOf(lines: LabelLine[]): string[] {
  return lines.flatMap((l) => [...l.allergens, ...(l.parts ? allergensOf(l.parts) : [])]);
}

export function buildLabel(lines: LabelLine[], opts: { pieces: number; gramsPerPiece?: number | null; includeRecommended?: boolean }): LabelResult {
  const ex = expand(lines);
  const main = ordered(ex.main);
  const adds = ordered(ex.adds);
  const allergens = sortAllergens(allergensOf(lines));
  const shown = opts.includeRecommended === false ? allergens.filter((a) => REQUIRED.has(a)) : allergens;

  // 食品表示基準の書き方：原材料（重い順）／添加物（重い順）、（一部に〇〇・〇〇を含む）
  let text = main.map((x) => x.name).join("、");
  if (adds.length) text += `／${adds.map((x) => x.name).join("、")}`;
  if (shown.length) text += `、（一部に${shown.map(allergenName).join("・")}を含む）`;

  const total = lines.reduce((s, l) => s + (l.grams ?? 0), 0);
  const per = opts.gramsPerPiece || (opts.pieces > 0 ? total / opts.pieces : total);
  return {
    ingredientsText: text,
    allergens: shown,
    contentText: per > 0 ? `1個（${Math.round(per)}g）` : "1個",
    unknownWeight: [...new Set(ex.unknown)],
  };
}

/**
 * 詰め合わせ（ギフト・コーヒー豆のセットなど）の原材料名。品目ごとに【名前】をつけて、それぞれの原材料とアレルゲンを書く
 * （食品表示基準で、詰め合わせは品目ごとに書く）
 */
export function assortText(items: { name: string; text: string }[]): string {
  return items.map((i) => `【${i.name}】${i.text}`).join("　");
}

/**
 * 詰め合わせの内容量（「バナナブレッド1個、チョコスコーン2個、コーヒー豆100g」）。
 * 品目に内容量（100g など）があればそれを使い、2つ以上なら「100g×2」
 */
export function assortContent(items: { name: string; count: number; content?: string }[]): string {
  return items.filter((i) => i.count > 0).map((i) => {
    const c = i.content?.trim();
    if (!c) return `${i.name}${i.count}個`;
    return `${i.name}${c}${i.count > 1 ? `×${i.count}` : ""}`;
  }).join("、");
}

/** 詰め合わせの名称の案：お店のレシピだけなら「焼菓子詰合せ」、コーヒー豆も入れば「焼菓子・コーヒー詰合せ」、ほかの品目なら「詰合せ」 */
export function assortName(category: string | undefined, freeNames: string[]): string {
  const cat = category || "菓子";
  if (!freeNames.length) return `${cat}詰合せ`;
  if (freeNames.every((n) => /コーヒー|珈琲/.test(n))) return `${cat}・コーヒー詰合せ`;
  return "詰合せ";
}

const REQUIRED = new Set<string>(["shrimp", "crab", "walnut", "wheat", "buckwheat", "egg", "milk", "peanut"]);

/** 期限の日付（製造日から n 日後）を YYYY.MM.DD で。日本時間の日付で数える */
export function expiryDate(made: Date, days: number): string {
  const jst = new Date(made.getTime() + 9 * 3600_000);
  jst.setUTCDate(jst.getUTCDate() + days);
  return jst.toISOString().slice(0, 10).replaceAll("-", ".");
}

/**
 * よく使うラベル用紙（1枚の幅×高さ mm）。sheet があるのは A4 の面付け（cols×rows、余白 mm）。
 * a4-12-half は A4 12面（86.4×42.3）の1面に2個分を並べ、はさみで半分に切る（小さい商品向け）
 */
export interface LabelPaper {
  id: string;
  name: string;
  w: number;
  h: number;
  sheet?: { cols: number; rows: number; top: number; left: number; cut?: boolean };
}

export const LABEL_PAPERS: LabelPaper[] = [
  { id: "a4-12", name: "A4 12面（86.4×42.3mm）", w: 86.4, h: 42.3, sheet: { cols: 2, rows: 6, top: 21.5, left: 18.6 } },
  { id: "a4-12-half", name: "A4 12面を半分に切る（1面に2個・43.2×42.3mm）", w: 43.2, h: 42.3, sheet: { cols: 4, rows: 6, top: 21.5, left: 18.6, cut: true } },
  { id: "62x40", name: "62×40mm（ブラザー QL 長尺テープ 62mm）", w: 62, h: 40 },
  { id: "62x60", name: "62×60mm（ブラザー QL 長尺テープ 62mm）", w: 62, h: 60 },
  { id: "62x100", name: "62×100mm（ブラザー QL DK-1202）", w: 62, h: 100 },
  { id: "50x80", name: "50×80mm（感熱ロール）", w: 50, h: 80 },
];
export type LabelPaperId = string;

/** 自由な大きさ（custom:幅x高さ）も読む。見つからなければ先頭 */
export function paperOf(id: string | null | undefined): LabelPaper {
  const hit = LABEL_PAPERS.find((p) => p.id === id);
  if (hit) return hit;
  const m = /^custom:(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(id ?? "");
  if (m) {
    const w = Math.min(200, Math.max(20, Number(m[1])));
    const h = Math.min(300, Math.max(15, Number(m[2])));
    return { id: `custom:${w}x${h}`, name: `自由な大きさ（${w}×${h}mm）`, w, h };
  }
  return LABEL_PAPERS[0];
}
