// 単位と g への換算（原価・ラベル・倍率の計算はすべて g にそろえてから行う）

export const UNITS = ["g", "kg", "ml", "l", "個", "枚", "本", "大さじ", "小さじ", "カップ", "適量"] as const;
export type Unit = (typeof UNITS)[number];

/** ml に直せる単位（計量スプーン・カップは日本の標準） */
const ML: Partial<Record<Unit, number>> = { ml: 1, l: 1000, 大さじ: 15, 小さじ: 5, カップ: 200 };
const PIECE: Unit[] = ["個", "枚", "本"];

export function isUnit(u: unknown): u is Unit {
  return typeof u === "string" && (UNITS as readonly string[]).includes(u);
}

/** 表記ゆれを単位に直す（「ｇ」「グラム」「cc」「大匙」など）。分からなければ null */
export function parseUnit(raw: string): Unit | null {
  const s = raw.normalize("NFKC").trim().toLowerCase();
  if (isUnit(s)) return s;
  const map: Record<string, Unit> = {
    グラム: "g", gr: "g", キロ: "kg", キログラム: "kg", cc: "ml", ミリリットル: "ml", ミリ: "ml",
    リットル: "l", ℓ: "l", 大匙: "大さじ", 大: "大さじ", tbsp: "大さじ", 小匙: "小さじ", 小: "小さじ", tsp: "小さじ",
    cup: "カップ", コ: "個", こ: "個", ケ: "個", ヶ: "個", 粒: "個", 玉: "個", パック: "個", 袋: "個",
    少々: "適量", 少量: "適量", ひとつまみ: "適量",
  };
  return map[s] ?? null;
}

export interface UnitHints {
  gramsPerPiece?: number | null;
  gramsPerMl?: number | null;
}

/**
 * 分量を g に直す。換算できないとき（個数なのに1個の重さが無い、適量）は null。
 * 液体は 1ml = gramsPerMl g（無ければ水と同じ 1）。
 */
export function toGrams(qty: number | null, unit: Unit, hints: UnitHints = {}): number | null {
  if (qty === null || !Number.isFinite(qty)) return null;
  if (unit === "g") return qty;
  if (unit === "kg") return qty * 1000;
  const ml = ML[unit];
  if (ml !== undefined) return qty * ml * (hints.gramsPerMl || 1);
  if (PIECE.includes(unit)) return hints.gramsPerPiece ? qty * hints.gramsPerPiece : null;
  return null;
}

/** 画面に出す分量（倍率をかけたあとの端数を読みやすくする） */
export function formatQty(qty: number | null): string {
  if (qty === null) return "";
  if (qty >= 100) return String(Math.round(qty));
  if (qty >= 10) return String(Math.round(qty * 10) / 10);
  return String(Math.round(qty * 100) / 100);
}
