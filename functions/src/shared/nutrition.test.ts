import { describe, expect, it } from "vitest";
import { nutritionLabelText, recipeNutrition } from "./nutrition";
import type { Ingredient, RecipeItem } from "./types";

const ing = (id: string, n?: Record<string, number>) => ({ id, name: id, nutrition: n } as unknown as Ingredient);
const item = (id: string, qty: number) => ({ name: id, qty, unit: "g", ingredientId: id } as unknown as RecipeItem);

describe("recipeNutrition", () => {
  const byId = new Map([
    ["粉", ing("粉", { kcal: 350, protein: 8, fat: 1.5, carbohydrate: 75, salt: 0 })],
    ["バター", ing("バター", { kcal: 700, protein: 0.5, fat: 80, carbohydrate: 0.2, salt: 1.9 })],
    ["謎", ing("謎")],
  ]);
  const nutOf = (i: Ingredient) => i.nutrition;

  it("合計を個数で割る。成分の無い材料は名前を返す", () => {
    const r = recipeNutrition([item("粉", 100), item("バター", 100), item("謎", 10)], byId, nutOf, { pieces: 10 });
    expect(r.perPiece?.kcal).toBeCloseTo(105);
    expect(r.gramsPerPiece).toBeCloseTo(21);
    expect(r.missing).toEqual(["謎"]);
    expect(nutritionLabelText(r)).toBeNull();
    const all = recipeNutrition([item("粉", 100), item("バター", 100), item("謎", 10)].slice(0, 2), byId, nutOf, { pieces: 10 });
    expect(nutritionLabelText(all)).toBe("1個（20g）当たり　熱量 105kcal、たんぱく質 0.9g、脂質 8.2g、炭水化物 7.5g、食塩相当量 0.19g（推定値）");
  });

  it("1個の重さが入っていれば、100gあたりは焼き上がりの重さで出す", () => {
    const r = recipeNutrition([item("粉", 100), item("バター", 100)], byId, nutOf, { pieces: 10, gramsPerPiece: 15 });
    expect(r.per100?.kcal).toBeCloseTo(700);
  });

  it("どれも分からなければ null", () => {
    expect(recipeNutrition([item("謎", 10)], byId, nutOf, { pieces: 1 }).perPiece).toBeNull();
  });
});
