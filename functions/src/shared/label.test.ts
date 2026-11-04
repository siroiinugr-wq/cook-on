import { describe, expect, it } from "vitest";
import { additiveLabel, guessAdditive } from "./additives";
import { assortContent, assortName, assortText, buildLabel, paperOf } from "./label";

describe("添加物の見分け", () => {
  it("ベーキングパウダーは膨張剤（一括名）。覚えた書き方が正式なら使う", () => {
    expect(guessAdditive("ベーキングパウダー")?.options[0]).toBe("膨張剤");
    expect(guessAdditive("BP")).not.toBeNull();
    expect(additiveLabel("ベーキングパウダー")).toBe("膨張剤");
    expect(additiveLabel("ベーキングパウダー", "ベーキングパウダー")).toBe("ベーキングパウダー");
    expect(additiveLabel("ベーキングパウダー", "ふくらし粉（アルミフリー）")).toBe("膨張剤");
  });
  it("香料・用途名併記", () => {
    expect(additiveLabel("バニラエッセンス")).toBe("香料");
    expect(additiveLabel("ペクチン")).toBe("ゲル化剤（ペクチン）");
  });
  it("食べ物は添加物にしない", () => {
    for (const n of ["薄力粉", "バニラビーンズ", "はちみつ", "レモン果汁", "ホットケーキミックス", "乳酸菌飲料", "ゼラチン"]) expect(guessAdditive(n)).toBeNull();
  });
});

describe("原材料名の文", () => {
  it("添加物は「／」のあと、アレルゲンは最後にまとめて", () => {
    const r = buildLabel([
      { name: "小麦粉", grams: 200, allergens: ["wheat"] },
      { name: "膨張剤", grams: 4, allergens: [], isAdditive: true },
      { name: "はちみつ", grams: 50, allergens: [] },
      { name: "鶏卵", grams: 100, allergens: ["egg"] },
    ], { pieces: 8 });
    expect(r.ingredientsText).toBe("小麦粉、鶏卵、はちみつ／膨張剤、（一部に小麦・卵を含む）");
  });
  it("お店で作った材料は（ ）に中身。中身の添加物は外の「／」のあとへ", () => {
    const r = buildLabel([
      { name: "りんご", grams: 300, allergens: ["apple"] },
      {
        name: "タルト生地", grams: 200, allergens: [], parts: [
          { name: "小麦粉", grams: 100, allergens: ["wheat"] },
          { name: "バター", grams: 60, allergens: ["milk"] },
          { name: "砂糖", grams: 40, allergens: [] },
          { name: "膨張剤", grams: 2, allergens: [], isAdditive: true },
        ],
      },
      { name: "香料", grams: 1, allergens: [], isAdditive: true },
    ], { pieces: 1 });
    expect(r.ingredientsText).toBe("りんご、タルト生地（小麦粉、バター、砂糖）／膨張剤、香料、（一部に小麦・乳成分・りんごを含む）");
  });
});

describe("詰め合わせと用紙", () => {
  it("品目ごとに【名前】", () => {
    expect(assortText([{ name: "マドレーヌ", text: "A" }, { name: "クッキー", text: "B" }])).toBe("【マドレーヌ】A　【クッキー】B");
    expect(assortContent([{ name: "マドレーヌ", count: 2 }, { name: "クッキー", count: 0 }])).toBe("マドレーヌ2個");
    expect(assortContent([{ name: "バナナブレッド", count: 1 }, { name: "チョコスコーン", count: 2 }, { name: "コーヒー豆", count: 1, content: "100g" }])).toBe("バナナブレッド1個、チョコスコーン2個、コーヒー豆100g");
    expect(assortContent([{ name: "コーヒー豆", count: 2, content: "100g" }])).toBe("コーヒー豆100g×2");
    expect(assortName("焼菓子", ["コーヒー豆（エチオピア）"])).toBe("焼菓子・コーヒー詰合せ");
    expect(assortName("焼菓子", [])).toBe("焼菓子詰合せ");
  });
  it("A4 12面の半分は 4列×6段", () => {
    const p = paperOf("a4-12-half");
    expect(p.w).toBeCloseTo(43.2);
    expect(p.sheet?.cols).toBe(4);
    expect(paperOf("custom:62x45")).toMatchObject({ w: 62, h: 45 });
    expect(paperOf("nope").id).toBe("a4-12");
  });
});
