// レシピから食品表示ラベルの中身を作る（1枚のラベル画面と、まとめて印刷の画面で共通）。
// 材料 → LabelLine：添加物は名前からも見分け（shared/additives.ts）、お店で作った材料（madeFrom）は中身のレシピまで開く
import { additiveLabel, guessAdditive, type AdditiveRule } from "@shared/additives";
import { calcCost } from "@shared/cost";
import { buildLabel, DATE_OUTSIDE_TEXT, expiryDate, type LabelInfo, type LabelLine, type LabelResult } from "@shared/label";
import type { Ingredient, Recipe } from "@shared/types";
import type { OrgSettings } from "../hooks/useOrg";

export interface AdditiveHint {
  ingredient: Ingredient;
  rule: AdditiveRule;
  /** いまラベルに出している名前 */
  current: string;
}

export interface BuiltLabel extends LabelResult {
  /** 材料の一覧と結びついていない行（アレルゲンが分からないので印刷させない） */
  unlinked: string[];
  /** アレルゲンを確かめていない材料（印刷させない） */
  unconfirmed: string[];
  /** 名前から添加物と見分けたが、材料にはまだ「添加物」と覚えていないもの・書き方を選べるもの */
  additives: AdditiveHint[];
  /** 栄養成分表示の文（計算できたとき。出すかどうかは LabelInfo.nutrition） */
  nutritionText?: string | null;
}

function linesOf(recipe: Pick<Recipe, "id" | "items">, ingById: Map<string, Ingredient>, recipeById: Map<string, Recipe>, acc: BuiltLabel, seen: Set<string>): LabelLine[] {
  const grams = calcCost(recipe.items, ingById).lines.map((l) => l.grams);
  return recipe.items.filter((it) => it.name.trim()).map((it) => {
    const i = recipe.items.indexOf(it);
    const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined;
    if (!ing) {
      if (!acc.unlinked.includes(it.name)) acc.unlinked.push(it.name);
      return { name: it.name, grams: grams[i], allergens: [] };
    }
    const rule = guessAdditive(ing.labelName || ing.name) ?? guessAdditive(ing.name);
    const isAdditive = ing.isAdditive === true || !!rule;
    let name = ing.labelName || ing.name;
    if (rule) {
      name = additiveLabel(ing.name, ing.labelName) ?? name;
      if (!acc.additives.some((a) => a.ingredient.id === ing.id) && (ing.isAdditive !== true || !rule.options.includes(ing.labelName ?? ""))) {
        acc.additives.push({ ingredient: ing, rule, current: name });
      }
    }
    // お店で作った材料：作るレシピの中身を「（ ）」に入れる。同じレシピをぐるぐるたどらない
    const sub = ing.madeFrom ? recipeById.get(ing.madeFrom) : undefined;
    let parts: LabelLine[] | undefined;
    if (sub && !seen.has(sub.id)) parts = linesOf(sub, ingById, recipeById, acc, new Set([...seen, sub.id]));
    else if (ing.allergensConfirmed !== true && !acc.unconfirmed.includes(ing.name)) acc.unconfirmed.push(ing.name);
    return { name, grams: grams[i], allergens: ing.allergens ?? [], isAdditive, parts };
  });
}

export function buildRecipeLabel(recipe: Recipe, ingById: Map<string, Ingredient>, recipeById: Map<string, Recipe>, settings: Pick<OrgSettings, "includeRecommendedAllergens">): BuiltLabel {
  const acc: BuiltLabel = { ingredientsText: "", allergens: [], contentText: "", unknownWeight: [], unlinked: [], unconfirmed: [], additives: [] };
  const lines = linesOf(recipe, ingById, recipeById, acc, new Set([recipe.id]));
  return { ...acc, ...buildLabel(lines, { pieces: recipe.yield.pieces, gramsPerPiece: recipe.yield.gramsPerPiece, includeRecommended: settings.includeRecommendedAllergens }) };
}

/** ラベルの初めの値：お店の初期値 → レシピに覚えた値 の順で上書き */
export function labelInfoFor(recipe: Recipe, s: OrgSettings): LabelInfo {
  return {
    productName: recipe.category || "菓子",
    storage: s.labelStorage || "直射日光・高温多湿を避けて保存してください",
    expiryDays: s.labelExpiryDays || 7,
    expiryKind: s.labelExpiryKind,
    dateOutside: s.labelDateOutside,
    datePrint: s.labelDatePrint,
    manufacturer: s.manufacturer,
    ...recipe.labelInfo,
    manufacturerAddress: recipe.labelInfo?.manufacturerAddress || s.manufacturerAddress,
  };
}

/** 手で直した原材料名が、今の自動の文から作ったものでなくなったか（材料が変わった） */
export function textOutdated(info: LabelInfo, auto: string): boolean {
  return !!info.ingredientsText && !!info.ingredientsBase && info.ingredientsBase !== auto;
}

export interface LabelData extends LabelInfo {
  ingredientsText: string;
  contentText: string;
  /** 期限の欄に出す文（日付か「枠外下部に記載」） */
  expiry: string;
  /** 枠の外に印刷する日付（無ければ出さない） */
  outsideDate: string | null;
  /** 栄養成分表示の文（出さないときは null） */
  nutritionText?: string | null;
}

export function labelData(info: LabelInfo, built: Pick<LabelResult, "ingredientsText" | "contentText"> & { nutritionText?: string | null }, made: string): LabelData {
  const date = expiryDate(new Date(`${made}T00:00:00+09:00`), info.expiryDays);
  return {
    ...info,
    ingredientsText: info.ingredientsText || built.ingredientsText,
    contentText: info.content?.trim() || built.contentText,
    expiry: info.dateOutside ? DATE_OUTSIDE_TEXT : date,
    nutritionText: info.nutrition ? built.nutritionText ?? null : null,
    outsideDate: info.dateOutside && info.datePrint !== false ? `${info.expiryKind} ${date}` : null,
  };
}
