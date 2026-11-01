import { describe, expect, it } from "vitest";
import { guessAllergens } from "./allergenGuess";
import { duplicateItems, guessPieces, isPlaceholderName, looksNotRecipe, mergeDuplicateItems, sameIngredient, similarIngredientGroups } from "./tidy";
import { labelMissing } from "./label";

describe("名前からアレルゲンを推定", () => {
  it("お菓子のよく使う材料", () => {
    expect(guessAllergens("卵")).toEqual(["egg"]);
    expect(guessAllergens("全卵")).toEqual(["egg"]);
    expect(guessAllergens("牛乳")).toEqual(["milk"]);
    expect(guessAllergens("発酵バター")).toEqual(["milk"]);
    expect(guessAllergens("薄力粉")).toEqual(["wheat"]);
    expect(guessAllergens("アーモンドプードル")).toEqual(["almond"]);
    expect(guessAllergens("生クリーム")).toEqual(["milk"]);
    expect(guessAllergens("マスカルポーネ")).toEqual(["milk"]);
    expect(guessAllergens("太白胡麻油")).toEqual(["sesame"]);
    expect(guessAllergens("生ハム")).toEqual(["pork"]);
    expect(guessAllergens("ホワイトチョコ")).toEqual(["milk"]);
  });
  it("含まないもの・紛らわしいもの", () => {
    expect(guessAllergens("グラニュー糖")).toEqual([]);
    expect(guessAllergens("キビ糖")).toEqual([]);
    expect(guessAllergens("ベーキングパウダー")).toEqual([]);
    expect(guessAllergens("山椒")).toEqual([]);
    expect(guessAllergens("豆乳")).toEqual(["soy"]);
    expect(guessAllergens("ココナッツミルク")).toEqual([]);
    expect(guessAllergens("クリームオブターター")).toEqual([]);
  });
});

describe("表記ゆれ", () => {
  it("同じものとみなす", () => {
    for (const [a, b] of [["きび砂糖", "キビ糖"], ["イチゴピューレ", "いちごピュレ"], ["太白胡麻油", "大白胡麻油"], ["ホワイトチョコ", "ホワイトチョコレート"], ["イチジク", "無花果"], ["マスカルポーネ", "マスカルポーネチーズ"]]) {
      expect(sameIngredient(a, b), `${a}/${b}`).toBe(true);
    }
  });
  it("違うものは分ける", () => {
    for (const [a, b] of [["無塩バター", "有塩バター"], ["卵黄", "卵白"], ["薄力粉", "強力粉"], ["アーモンド", "アーモンドプードル"], ["35%生クリーム", "47%生クリーム"], ["グラニュー糖", "粉糖"]]) {
      expect(sameIngredient(a, b), `${a}/${b}`).toBe(false);
    }
  });
  it("組にまとめる", () => {
    const g = similarIngredientGroups([{ id: "1", name: "きび砂糖" }, { id: "2", name: "薄力粉" }, { id: "3", name: "キビ糖" }]);
    expect(g.map((x) => x.map((i) => i.id))).toEqual([["1", "3"]]);
  });
});

describe("レシピの見直し", () => {
  it("名前のないレシピ", () => {
    expect(isPlaceholderName("名前のないレシピ")).toBe(true);
    expect(isPlaceholderName("レシピ3")).toBe(true);
    expect(isPlaceholderName("山椒クッキー")).toBe(false);
  });
  it("レシピでないもの", () => {
    expect(looksNotRecipe({ name: "薄力粉のデータ", items: [], steps: [] })).toBe(true);
    expect(looksNotRecipe({ name: "生ハム", items: [{ ingredientId: null, name: "生ハム", qty: 100, unit: "g" }], steps: [] })).toBe(true);
  });
  it("何個分を文から読む", () => {
    expect(guessPieces(["山椒クッキー", "約24枚分"])).toBe(24);
    expect(guessPieces(["170℃で15分焼く"])).toBeNull();
    expect(guessPieces(["卵1個を加える", "12個分"])).toBe(12);
  });
  it("同じ材料の行をまとめる", () => {
    const items = [
      { ingredientId: "a", name: "粉糖", qty: 30, unit: "g" as const },
      { ingredientId: "b", name: "山椒", qty: 2, unit: "g" as const },
      { ingredientId: "a", name: "粉糖", qty: 10, unit: "g" as const, note: "仕上げ" },
      { ingredientId: "a", name: "粉糖", qty: 5, unit: "g" as const },
    ];
    expect(duplicateItems(items)).toEqual(["粉糖"]);
    const m = mergeDuplicateItems(items);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ ingredientId: "a", qty: 45, note: "仕上げ" });
  });
});

describe("ラベルの必須項目", () => {
  it("住所が無ければ印刷させない", () => {
    expect(labelMissing({ productName: "焼菓子", storage: "", expiryDays: 7, expiryKind: "賞味期限", manufacturer: "imm" })).toEqual(["製造者の住所"]);
  });
});
