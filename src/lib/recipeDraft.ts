// 書きかけのレシピを端末（sessionStorage）にしまう。
// レシピの編集から「材料の自家製レシピを作る」へ寄り道して戻ってきたとき、打った内容をそのまま続けられるように（2026-11-15）。
// 置き場所は「直しているレシピ id」「自家製の材料のレシピ（for）」「新しいレシピ」で分け、寄り道先と取り合わない
export interface StashedDraft<D, R> {
  draft: D;
  rows: R[];
  tagText: string;
  note: string;
  trial: boolean;
  at: number;
}

const PREFIX = "cookon-recipeDraft:";
/** 半日より古い書きかけは使わない（別の日の書きかけで上書きしないため） */
const MAX_AGE = 12 * 60 * 60 * 1000;

export function draftKey(recipeId: string | undefined, forIngredientId: string | null): string {
  return recipeId ? `edit:${recipeId}` : forIngredientId ? `for:${forIngredientId}` : "new";
}

export function stashDraft<D, R>(key: string, v: Omit<StashedDraft<D, R>, "at">): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ ...v, at: Date.now() }));
  } catch {
    /* プライベートモードなどでしまえなくても、画面は動かす */
  }
}

export function loadDraft<D, R>(key: string): StashedDraft<D, R> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as StashedDraft<D, R>;
    if (!v?.draft || Date.now() - (v.at ?? 0) > MAX_AGE) return null;
    return v;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* 何もしない */
  }
}

/** 寄り道から戻る先（レシピの編集）に「書きかけを続ける」の印を付ける */
export function resumeUrl(path: string): string {
  return path.includes("resume=1") ? path : `${path}${path.includes("?") ? "&" : "?"}resume=1`;
}
