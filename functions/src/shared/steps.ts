// 工程をまとめて直す：よく使う工程を直したら使っているレシピに反映する／1つの工程に付けた写真を、同じ工程の他のレシピにも付ける。
// 画面（どのレシピが対象かを見せる）とサーバー（recipes/steps.ts の syncSteps が実際に直す）で同じ関数を使う。
import type { RecipeStep, StepTemplate } from "./types";

/** 工程の文を比べるための形（空白・句読点・全角半角の違いは無視） */
export function stepKey(text: string): string {
  return text.normalize("NFKC").replace(/[\s、。,.・!！?？「」()（）]/g, "").toLowerCase();
}

/** よく使う工程から入れるときの工程（写真があれば一緒に入れる） */
export function stepsFromTemplate(t: Pick<StepTemplate, "id" | "steps" | "photoPaths">): RecipeStep[] {
  return t.steps.map((text, i) => ({ text, photoPath: t.photoPaths?.[i] || null, templateId: t.id, templateStep: i }));
}

/**
 * よく使う工程の今の中身で、レシピの中の「そこから入れた工程」を置き換える。
 * 続いて並んでいるひとかたまりを丸ごと入れ替えるので、工程が増えた・減った・文を直した、のどれも反映される。
 * 写真はよく使う工程に写真があればそれ、無ければレシピに付いていた写真を残す。
 */
export function applyTemplate(steps: RecipeStep[], t: Pick<StepTemplate, "id" | "steps" | "photoPaths">): { steps: RecipeStep[]; changed: boolean } {
  const fresh = stepsFromTemplate(t);
  const out: RecipeStep[] = [];
  let i = 0;
  while (i < steps.length) {
    if (steps[i].templateId !== t.id) {
      out.push(steps[i++]);
      continue;
    }
    const block: RecipeStep[] = [];
    // 同じよく使う工程を2回続けて入れたときは、番号が戻ったところで分ける
    while (i < steps.length && steps[i].templateId === t.id && (!block.length || (steps[i].templateStep ?? 0) > (block[block.length - 1].templateStep ?? 0))) block.push(steps[i++]);
    const old = new Map(block.map((s) => [s.templateStep ?? -1, s.photoPath ?? null]));
    out.push(...fresh.map((s, k) => ({ ...s, photoPath: s.photoPath || old.get(k) || null })));
  }
  const same = (a: RecipeStep, b: RecipeStep) => a.text === b.text && (a.photoPath ?? null) === (b.photoPath ?? null) && a.templateId === b.templateId && a.templateStep === b.templateStep;
  const changed = out.length !== steps.length || out.some((s, k) => !same(s, steps[k]));
  return { steps: out, changed };
}

/** 文が同じ工程に写真を付ける（すでに別の写真があっても置き換える。対象は人が選んだレシピだけ） */
export function applyStepPhoto(steps: RecipeStep[], text: string, photoPath: string): { steps: RecipeStep[]; changed: boolean } {
  const key = stepKey(text);
  let changed = false;
  const out = steps.map((s) => {
    if (!key || stepKey(s.text) !== key || s.photoPath === photoPath) return s;
    changed = true;
    return { ...s, photoPath };
  });
  return { steps: out, changed };
}

type R = { id: string; name: string; steps: RecipeStep[] };

/** よく使う工程を使っているレシピ */
export function recipesUsingTemplate<T extends R>(recipes: T[], templateId: string): T[] {
  return recipes.filter((r) => r.steps.some((s) => s.templateId === templateId));
}

/** 同じ文の工程があって、まだその写真が付いていないレシピ */
export function recipesWithStep<T extends R>(recipes: T[], text: string, photoPath: string | null = null): T[] {
  const key = stepKey(text);
  if (!key) return [];
  return recipes.filter((r) => r.steps.some((s) => stepKey(s.text) === key && (photoPath === null || s.photoPath !== photoPath)));
}
