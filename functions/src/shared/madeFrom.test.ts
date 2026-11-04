import { describe, expect, it } from "vitest";
import { categorySuspect, dropCategoryHits, guessAllergens, needsPackageCheck, suggestAllergens } from "./allergenGuess";
import { guessMextAllergens } from "./mext";
import { madeFromCandidates, madeFromChanged, madeFromPatch, usesIngredient } from "./madeFrom";
import type { Ingredient } from "./types";

describe("アレルゲンの推定（2026-11-03 の見直し）", () => {
  it("成分表の分類の見出しから付けない", () => {
    expect(guessMextAllergens("10319", "＜えび・かに類＞ （えび類） あまえび 生")).toEqual(["shrimp"]);
    expect(guessMextAllergens("10361", "＜いか・たこ類＞ （たこ類） まだこ ゆで")).toEqual([]);
    expect(guessMextAllergens("10335", "＜えび・かに類＞ （かに類） ずわいがに 生")).toEqual(["crab"]);
    expect(guessAllergens("あまえび ＜えび・かに類＞ （えび類） あまえび 生")).toEqual(["shrimp"]);
    expect(guessAllergens("ゆでだこ ＜いか・たこ類＞ （たこ類） まだこ ゆで")).toEqual([]);
  });
  it("誤って付いた分を外す（成分表に結んだ材料だけ）", () => {
    expect(dropCategoryHits(["shrimp", "crab"], ["あまえび"])).toEqual(["shrimp"]);
    expect(dropCategoryHits(["squid"], ["ゆでだこ"])).toEqual([]);
    expect(suggestAllergens([], "あまえび", ["shrimp", "crab"], "mext_10319")).toEqual(["shrimp"]);
    expect(suggestAllergens([], "シーフードミックス", ["shrimp", "squid"], "ugc_1")).toEqual(["shrimp", "squid"]);
    expect(categorySuspect({ name: "ゆでだこ", allergens: ["squid"], globalRef: "mext_10361" })).toBe(true);
    expect(categorySuspect({ name: "するめいか", allergens: ["squid"], globalRef: "mext_10345" })).toBe(false);
  });
  it("お店で作る生地・クリーム・ミックスナッツ", () => {
    expect(guessAllergens("タルト生地シュクレ")).toEqual(expect.arrayContaining(["wheat", "egg", "milk"]));
    expect(guessAllergens("クレームダマンド")).toEqual(expect.arrayContaining(["almond", "egg", "milk"]));
    expect(guessAllergens("クランブル")).toEqual(expect.arrayContaining(["wheat", "milk"]));
    expect(guessAllergens("ミックスナッツ")).toEqual(expect.arrayContaining(["almond", "cashew", "walnut"]));
  });
  it("既製品らしい名前は袋の裏で確かめてもらう", () => {
    expect(needsPackageCheck("シーザードレッシング")).toBe(true);
    expect(needsPackageCheck("エビチリの素")).toBe(true);
    expect(needsPackageCheck("薄力粉")).toBe(false);
  });
});

const ing = (id: string, p: Partial<Ingredient>): Ingredient => ({ id, name: id, purchasePrice: null, purchaseQty: 1, purchaseUnit: "kg", allergens: [], ...p });

describe("自家製の材料（レシピに結ぶ）", () => {
  const byId = new Map([
    ["flour", ing("flour", { purchasePrice: 300, purchaseQty: 1, purchaseUnit: "kg", allergens: ["wheat"], allergensConfirmed: true })],
    ["butter", ing("butter", { purchasePrice: 1500, purchaseQty: 1, purchaseUnit: "kg", allergens: ["milk"], allergensConfirmed: true })],
    ["egg", ing("egg", { purchasePrice: null, allergens: ["egg"] })],
  ]);
  it("値段は材料の合計、量は合計の重さ、アレルゲンは中身の分", () => {
    const p = madeFromPatch([
      { ingredientId: "flour", name: "薄力粉", qty: 200, unit: "g" },
      { ingredientId: "butter", name: "バター", qty: 100, unit: "g" },
    ], byId);
    expect(p).toMatchObject({ purchasePrice: 210, purchaseQty: 300, purchaseUnit: "g", allergens: expect.arrayContaining(["wheat", "milk"]), allergensConfirmed: true, missing: 0 });
  });
  it("値段の無い材料があれば値段は空、確かめていない材料があれば未確認", () => {
    const p = madeFromPatch([
      { ingredientId: "flour", name: "薄力粉", qty: 200, unit: "g" },
      { ingredientId: "egg", name: "卵", qty: 50, unit: "g" },
    ], byId);
    expect(p.purchasePrice).toBeNull();
    expect(p.allergensConfirmed).toBe(false);
    expect(madeFromChanged({ ...p }, p)).toBe(false);
    expect(madeFromChanged({ ...p, purchasePrice: 1 }, p)).toBe(true);
  });
  it("自分を使うレシピには結ばない（ぐるぐる回らない）", () => {
    const rec = new Map([["tart", ["dough", "flour"]], ["dough", ["flour"]]]);
    const made = new Map([["dough", "dough"]]);
    expect(usesIngredient("dough", "dough", new Map([["dough", ["dough"]]]), new Map())).toBe(true);
    expect(usesIngredient("dough", "x", rec, made)).toBe(false);
    expect(usesIngredient("tart", "flour", rec, made)).toBe(true);
  });
  it("同じ名前のレシピを候補にする", () => {
    const rs = [{ id: "1", name: "タルト生地（シュクレ）" }, { id: "2", name: "自家製クランブル" }, { id: "3", name: "いちごタルト" }];
    expect(madeFromCandidates({ name: "タルト生地" }, rs).map((r) => r.id)).toEqual(["1"]);
    expect(madeFromCandidates({ name: "クランブル" }, rs).map((r) => r.id)).toEqual(["2"]);
  });
});

describe("自家製の材料：成分と名前の一部", () => {
  it("中身の成分（100gあたり）を重さで割り合わせる", async () => {
    const { madeFromNutrition } = await import("./madeFrom");
    const ings = new Map<string, Ingredient>([
      ["a", { id: "a", name: "バター", purchasePrice: null, purchaseQty: 1, purchaseUnit: "g", allergens: [], globalRef: "g_a" }],
      ["b", { id: "b", name: "砂糖", purchasePrice: null, purchaseQty: 1, purchaseUnit: "g", allergens: [], globalRef: "g_b" }],
      ["c", { id: "c", name: "塩", purchasePrice: null, purchaseQty: 1, purchaseUnit: "g", allergens: [] }],
    ]);
    const nut: Record<string, Record<string, number>> = { g_a: { kcal: 700, fat: 80 }, g_b: { kcal: 400 } };
    const r = madeFromNutrition([
      { ingredientId: "a", name: "バター", qty: 100, unit: "g" },
      { ingredientId: "b", name: "砂糖", qty: 100, unit: "g" },
      { ingredientId: "c", name: "塩", qty: 0, unit: "適量" },
    ], ings, (i) => (i.globalRef ? nut[i.globalRef] : null));
    expect(r.missing).toBe(0);
    expect(r.nutrition).toEqual({ kcal: 550, fat: 40 });
    const r2 = madeFromNutrition([
      { ingredientId: "a", name: "バター", qty: 100, unit: "g" },
      { ingredientId: "c", name: "塩", qty: 100, unit: "g" },
    ], ings, (i) => (i.globalRef ? nut[i.globalRef] : null));
    expect(r2.missing).toBe(1);
    expect(r2.nutrition?.kcal).toBe(350);
  });
  it("成分を渡したときだけ patch に入る", () => {
    const ings = new Map<string, Ingredient>();
    expect("nutrition" in madeFromPatch([], ings)).toBe(false);
    expect("nutrition" in madeFromPatch([], ings, () => null)).toBe(true);
  });
  it("名前の一部が同じレシピ", async () => {
    const { madeFromPartial } = await import("./madeFrom");
    const recipes = [{ id: "1", name: "クレームダマンド" }, { id: "2", name: "りんごのキャラメリゼ" }, { id: "3", name: "ガトーショコラ" }];
    expect(madeFromPartial({ name: "ダマンド" }, recipes).map((r) => r.id)).toEqual(["1"]);
    expect(madeFromPartial({ name: "キャラメリゼ" }, recipes).map((r) => r.id)).toEqual(["2"]);
    expect(madeFromPartial({ name: "ショコラ" }, recipes).map((r) => r.id)).toEqual(["3"]);
    expect(madeFromPartial({ name: "卵" }, recipes)).toEqual([]);
  });
});
