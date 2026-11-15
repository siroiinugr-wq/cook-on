import { describe, expect, it } from "vitest";
import { staffIngredient, staffRecipe } from "./staffView";
import { canRunAction, canSeeMoney, canUseAi } from "./roles";

describe("スタッフ用の写し", () => {
  it("材料から仕入れ値・ネットの値段・仕入れ先を抜き、名前・アレルゲン・量は残す", () => {
    const s = staffIngredient({ name: "薄力粉", purchasePrice: 300, priceTax: 0.08, priceSource: "ref", refWeb: {}, offers: {}, supplier: "○○", purchaseQty: 1, purchaseUnit: "kg", allergens: ["wheat"] });
    expect(s).toEqual({ name: "薄力粉", purchaseQty: 1, purchaseUnit: "kg", allergens: ["wheat"] });
  });
  it("レシピから売価・目標原価率・原価・包装を抜く", () => {
    const s = staffRecipe({ name: "クッキー", items: [], sellingPrice: 300, targetCostRate: 0.3, costCache: { total: 1 }, packaging: [], packagingIds: [], packagingSetIds: [], allergens: [] });
    expect(s).toEqual({ name: "クッキー", items: [], allergens: [] });
  });
});

describe("役割", () => {
  it("経営の情報はオーナー・管理者だけ", () => {
    expect(["owner", "admin", "editor", "viewer"].map((r) => canSeeMoney(r as never))).toEqual([true, true, false, false]);
  });
  it("AIは管理者がいつも、スタッフは許可された人だけ、見るだけは使えない", () => {
    expect(canUseAi("admin", undefined)).toBe(true);
    expect(canUseAi("editor", undefined)).toBe(false);
    expect(canUseAi("editor", true)).toBe(true);
    expect(canUseAi("viewer", true)).toBe(false);
  });
  it("お金のAI（ネットの値段・レシート・原価の相談）は許可されたスタッフでも使えない", () => {
    expect(canRunAction("importPhoto", "editor", true)).toBe(true);
    expect(canRunAction("priceSearch", "editor", true)).toBe(false);
    expect(canRunAction("aiSuggest", "admin", undefined)).toBe(true);
  });
});
