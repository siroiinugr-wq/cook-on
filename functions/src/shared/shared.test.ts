// 共通の計算のテスト（npm test）。原価・ラベル・名寄せ・クレジットはお金と表示に関わるので必ず通す
import { describe, expect, it } from "vitest";
import { calcCost, scaleFactor, suggestPrice, unitCostPerGram, costCacheOf } from "./cost";
import { buildLabel, expiryDate } from "./label";
import { buildIndex, exactMatch, rankCandidates, toMatchKey } from "./matchKey";
import { importCredits, splitForImport, aiMatchCredits } from "./credits";
import { judgeUgc, voteDelta } from "./ugc";
import { toGrams, parseUnit } from "./units";
import { deriveRecipe, sanitizeRecipe } from "./recipe";
import { calcPackaging, packUnitCost, sanitizePackLines, type PackCtx } from "./packaging";
import type { Ingredient, PackagingMaterial, RecipeItem } from "./types";

const ing = (id: string, o: Partial<Ingredient>): Ingredient => ({
  id, name: id, purchasePrice: 0, purchaseQty: 1, purchaseUnit: "kg", allergens: [], ...o,
});

describe("単位", () => {
  it("g に直す", () => {
    expect(toGrams(2, "kg")).toBe(2000);
    expect(toGrams(1, "大さじ")).toBe(15);
    expect(toGrams(200, "ml", { gramsPerMl: 1.03 })).toBeCloseTo(206);
    expect(toGrams(3, "個", { gramsPerPiece: 50 })).toBe(150);
    expect(toGrams(3, "個")).toBeNull();
  });
  it("表記ゆれを読む", () => {
    expect(parseUnit("ｇ")).toBe("g");
    expect(parseUnit("CC")).toBe("ml");
    expect(parseUnit("少々")).toBe("適量");
  });
});

describe("原価", () => {
  const map = new Map([
    ["flour", ing("flour", { purchasePrice: 300, purchaseQty: 1, purchaseUnit: "kg" })],
    ["egg", ing("egg", { purchasePrice: 300, purchaseQty: 10, purchaseUnit: "個", gramsPerPiece: 50 })],
    ["noprice", ing("noprice", { purchasePrice: null })],
  ]);
  const items: RecipeItem[] = [
    { ingredientId: "flour", name: "薄力粉", qty: 200, unit: "g" },
    { ingredientId: "egg", name: "卵", qty: 2, unit: "個" },
    { ingredientId: "noprice", name: "バニラ", qty: 1, unit: "g" },
    { ingredientId: null, name: "塩", qty: null, unit: "適量" },
  ];
  it("1g の単価", () => {
    expect(unitCostPerGram(map.get("flour")!)).toBeCloseTo(0.3);
    expect(unitCostPerGram(map.get("noprice")!)).toBeNull();
  });
  it("合計と、計算に入らない行を数える（適量は数えない）", () => {
    const r = calcCost(items, map);
    expect(r.total).toBeCloseTo(60 + 60);
    expect(r.missing).toBe(1);
    expect(r.lines[2].missing).toBe("noPrice");
  });
  it("倍率（2.5ロット・30個）", () => {
    expect(calcCost(items, map, 2.5).total).toBeCloseTo(300);
    expect(scaleFactor({ kind: "pieces", pieces: 30 }, 12)).toBe(2.5);
  });
  it("目標原価率30%から売価を逆算（10円単位で切り上げ）", () => {
    expect(suggestPrice(42, 0.3)).toBe(140);
    expect(suggestPrice(43, 0.3)).toBe(150);
  });
  it("一覧用のまとめ", () => {
    const c = costCacheOf(items, map, 10, 40);
    expect(c.perPiece).toBeCloseTo(12);
    expect(c.rate).toBeCloseTo(0.3);
  });
});

describe("包装", () => {
  const mat = (id: string, price: number | null, qty: number): PackagingMaterial => ({ id, name: id, purchasePrice: price, purchaseQty: qty, unit: "枚" });
  const ctx: PackCtx = {
    matById: new Map([["bag10", mat("bag10", 1500, 100)], ["oxy30", mat("oxy30", 2000, 200)], ["seal", mat("seal", null, 1)]]),
    setById: new Map([["s1", { id: "s1", name: "10cm袋セット", items: [{ packagingId: "bag10", name: "10cm袋", qty: 1 }, { packagingId: "oxy30", name: "脱酸素剤30", qty: 1 }] }]]),
  };
  it("資材1枚の値段・セットの合計・値段の無い資材を数える", () => {
    expect(packUnitCost(ctx.matById.get("bag10")!)).toBeCloseTo(15);
    const r = calcPackaging([
      { kind: "set", refId: "s1", name: "10cm袋セット", qty: 1 },
      { kind: "item", refId: "seal", name: "シール", qty: 2 },
      { kind: "set", refId: "gone", name: "消したセット", qty: 1 },
    ], ctx);
    expect(r.lines[0].cost).toBeCloseTo(25);
    expect(r.perPiece).toBeCloseTo(25);
    expect(r.missing).toBe(2);
  });
  it("1個あたりの原価に包装が足され、使っている資材とセットの id が残る", () => {
    const map = new Map([["flour", ing("flour", { purchasePrice: 300, purchaseQty: 1, purchaseUnit: "kg" })]]);
    const input = sanitizeRecipe({
      name: "クッキー", yield: { pieces: 10 }, sellingPrice: 200,
      items: [{ ingredientId: "flour", name: "薄力粉", qty: 500, unit: "g" }],
      packaging: [{ kind: "set", refId: "s1", name: "10cm袋セット", qty: 1 }],
    });
    if (typeof input === "string") throw new Error(input);
    const d = deriveRecipe(input, map, ctx);
    expect(d.costCache.perPiece).toBeCloseTo(15 + 25);
    expect(d.costCache.packagingPerPiece).toBeCloseTo(25);
    expect(d.costCache.rate).toBeCloseTo(0.2);
    expect(d.packagingIds.sort()).toEqual(["bag10", "oxy30"]);
    expect(d.packagingSetIds).toEqual(["s1"]);
  });
  it("おかしな行を整える（数が0やマイナスは1、空の行は捨てる）", () => {
    expect(sanitizePackLines([{ kind: "set", refId: "s1", name: "x", qty: -3 }, { kind: "item", refId: "", name: "" }])).toEqual([
      { kind: "set", refId: "s1", name: "x", qty: 1 },
    ]);
  });
});

describe("ラベル", () => {
  it("重い順に並べ、添加物は／のあと、アレルゲンは最後にまとめる", () => {
    const r = buildLabel([
      { name: "砂糖", grams: 60, allergens: [] },
      { name: "小麦粉", grams: 180, allergens: ["wheat"] },
      { name: "バター", grams: 100, allergens: ["milk"] },
      { name: "膨張剤", grams: 2, allergens: [], isAdditive: true },
      { name: "鶏卵", grams: 25, allergens: ["egg"] },
      { name: "塩", grams: null, allergens: [] },
    ], { pieces: 10 });
    expect(r.ingredientsText).toBe("小麦粉、バター、砂糖、鶏卵、塩／膨張剤、（一部に小麦・卵・乳成分を含む）");
    expect(r.unknownWeight).toEqual(["塩"]);
    expect(r.contentText).toBe("1個（37g）");
  });
  it("同じ名前はまとめる", () => {
    const r = buildLabel([{ name: "砂糖", grams: 10, allergens: [] }, { name: "卵", grams: 15, allergens: [] }, { name: "砂糖", grams: 10, allergens: [] }], { pieces: 1 });
    expect(r.ingredientsText).toBe("砂糖、卵");
  });
  it("期限は日本時間の日付で数える", () => {
    expect(expiryDate(new Date("2026-10-19T16:00:00Z"), 3)).toBe("2026.10.23");
  });
});

describe("名寄せ（無料の部分）", () => {
  const index = buildIndex([
    { id: "g1", name: "チョコレート", aliases: ["チョコ"] },
    { id: "g2", name: "薄力粉", aliases: [] },
    { id: "g3", name: "無塩バター", aliases: ["食塩不使用バター"] },
    { id: "g4", name: "有塩バター", aliases: [] },
  ]);
  it("照合キー", () => {
    expect(toMatchKey("ﾌﾞﾗｯｸ ちょこ（明治）")).toBe("ブラックチョコ");
  });
  it("別名で完全一致", () => {
    expect(exactMatch("ちょこ", index)?.id).toBe("g1");
    expect(exactMatch("食塩不使用 バター", index)?.id).toBe("g3");
  });
  it("似ている順に候補を出す", () => {
    const c = rankCandidates("ブラックチョコ", index);
    expect(c[0].id).toBe("g1");
    expect(rankCandidates("バター", index).map((x) => x.id).slice(0, 2).sort()).toEqual(["g3", "g4"]);
  });
});

describe("クレジット", () => {
  it("取り込みは6,000字ごとに1クレジット。行の途中では切らない", () => {
    const line = "あ".repeat(99);
    const text = Array.from({ length: 130 }, () => line).join("\n"); // 13,000字
    const chunks = splitForImport(text);
    expect(chunks.length).toBe(3);
    expect(chunks.every((c) => c.length <= 6000)).toBe(true);
    expect(chunks.join("\n")).toBe(text);
    expect(importCredits(text)).toBe(3);
    expect(importCredits("   ")).toBe(0);
  });
  it("とても長い1行も分ける", () => {
    expect(splitForImport("x".repeat(13000)).length).toBe(3);
  });
  it("名寄せは20件ごとに1クレジット", () => {
    expect(aiMatchCredits(1)).toBe(1);
    expect(aiMatchCredits(20)).toBe(1);
    expect(aiMatchCredits(21)).toBe(2);
  });
});

describe("UGCの評価", () => {
  it("Good 10店舗・8割以上で昇格、Bad が多ければ外す", () => {
    expect(judgeUgc(10, 2)).toBe("promote");
    expect(judgeUgc(10, 3)).toBe("keep");
    expect(judgeUgc(1, 5)).toBe("reject");
  });
  it("票の付け替え", () => {
    expect(voteDelta(1, -1)).toEqual({ good: -1, bad: 1 });
    expect(voteDelta(null, 1)).toEqual({ good: 1, bad: 0 });
  });
});

describe("レシピの入力", () => {
  it("名前が無ければエラーの文、値は整える", () => {
    expect(sanitizeRecipe({ name: " " })).toBe("レシピ名を入れてください。");
    const r = sanitizeRecipe({ name: "A", items: [{ name: "砂糖", qty: -1, unit: "トン" }], yield: { pieces: 0 }, targetCostRate: 3 });
    expect(typeof r).toBe("object");
    if (typeof r === "string") return;
    expect(r.items[0]).toMatchObject({ qty: null, unit: "g" });
    expect(r.yield.pieces).toBe(1);
    expect(r.targetCostRate).toBeNull();
  });
});
