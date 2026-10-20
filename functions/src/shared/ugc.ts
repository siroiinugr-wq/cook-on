// 既製品データ（UGC）の評価と、共有マスターへの昇格の決まり。数字はここ1か所だけ。
// 投票は「1店舗1票」。同じ人がアカウントを増やしても票が増えにくいようにするため。

/** 昇格に必要な Good の店舗数 */
export const PROMOTE_MIN_GOOD = 10;
/** 昇格に必要な Good の割合（Good ÷ (Good + Bad)） */
export const PROMOTE_MIN_RATIO = 0.8;
/** Bad がこの数以上で、Good の割合が REJECT_MAX_RATIO 未満なら候補から外す */
export const REJECT_MIN_BAD = 5;
export const REJECT_MAX_RATIO = 0.3;

export type Vote = 1 | -1;

export function goodRatio(good: number, bad: number): number {
  return good + bad > 0 ? good / (good + bad) : 0;
}

export function judgeUgc(good: number, bad: number): "promote" | "reject" | "keep" {
  if (good >= PROMOTE_MIN_GOOD && goodRatio(good, bad) >= PROMOTE_MIN_RATIO) return "promote";
  if (bad >= REJECT_MIN_BAD && goodRatio(good, bad) < REJECT_MAX_RATIO) return "reject";
  return "keep";
}

/** 票が変わったときの Good / Bad の増減（前の票 → 新しい票。無いときは null） */
export function voteDelta(before: Vote | null, after: Vote | null): { good: number; bad: number } {
  const g = (v: Vote | null) => (v === 1 ? 1 : 0);
  const b = (v: Vote | null) => (v === -1 ? 1 : 0);
  return { good: g(after) - g(before), bad: b(after) - b(before) };
}

/** 栄養成分の項目（食品表示の栄養成分表示と同じ5つ。100gあたりで持つ） */
export const NUTRITION_KEYS = ["kcal", "protein", "fat", "carbohydrate", "salt"] as const;

/**
 * パッケージの「1枚（12g）あたり」の値を100gあたりに直す。
 * 何gあたりか分からない（「1個あたり」だけ）ときは直せないので null。小数は2桁まで。
 */
export function toPer100g(values: Record<string, unknown>, grams: number | null | undefined): Record<string, number> | null {
  if (!grams || !(grams > 0)) return null;
  const out: Record<string, number> = {};
  for (const k of NUTRITION_KEYS) {
    const v = values[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.round((v * 100 / grams) * 100) / 100;
  }
  return out;
}
