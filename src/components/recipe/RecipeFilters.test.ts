import { describe, expect, it } from "vitest";
import type { Ingredient, Recipe } from "@shared/types";
import { applyFilter, EMPTY_FILTER, groupRecipes, homemadeIds } from "./RecipeFilters";

const rec = (id: string, name: string, category = "", subcategory = "", extra: Partial<Recipe> = {}) =>
  ({ id, name, category, subcategory, tags: [], items: [], steps: [], yield: { pieces: 1 }, sellingPrice: null, targetCostRate: null, ingredientIds: [], allergens: [], costCache: null, version: 1, ...extra }) as Recipe;

const list = [
  rec("a", "チョコクッキー", "焼菓子", "クッキー"),
  rec("b", "パウンドケーキ", "焼菓子", "パウンドケーキ"),
  rec("c", "タルト生地", "焼菓子", "タルト"),
  rec("d", "カスタード", "自家製材料", "クリーム"),
  rec("e", "新作マフィン", "", "", { trial: true, trialNote: "甘さ控えめに" }),
];
const ings = [{ id: "i1", name: "タルト生地", madeFrom: "c" }] as Ingredient[];

describe("レシピ一覧の分け方", () => {
  const home = homemadeIds(list, ings);
  it("材料に結んだレシピと分類が自家製材料のレシピは自家製材料", () => {
    expect([...home].sort()).toEqual(["c", "d"]);
  });
  it("すべて：自家製材料は最後の別グループ、分類なしはその前", () => {
    const g = groupRecipes(list, home, "all");
    expect(g.map((x) => x.title)).toEqual(["焼菓子", "分類なし", "自家製材料"]);
    expect(g[0].items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(g[2].items.map((r) => r.id).sort()).toEqual(["c", "d"]);
  });
  it("見る範囲でしぼる", () => {
    expect(applyFilter(list, { ...EMPTY_FILTER, view: "products" }, home).map((r) => r.id)).toEqual(["a", "b", "e"]);
    expect(applyFilter(list, { ...EMPTY_FILTER, view: "homemade" }, home).map((r) => r.id)).toEqual(["c", "d"]);
    expect(applyFilter(list, { ...EMPTY_FILTER, view: "trial" }, home).map((r) => r.id)).toEqual(["e"]);
  });
  it("試作のメモでも探せる", () => {
    expect(applyFilter(list, { ...EMPTY_FILTER, text: "甘さ" }, home).map((r) => r.id)).toEqual(["e"]);
  });
});
