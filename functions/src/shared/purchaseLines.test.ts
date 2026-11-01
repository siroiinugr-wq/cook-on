import { describe, expect, it } from "vitest";
import { fromPurchaseLines, invoicePatch, needsWebSize, per100, productSizeKey, sameSizePrice, sizeDoubt, sizeFromName } from "./invoice";
import { parsePurchaseCsv, toPurchaseCsv, type PurchaseLine } from "./purchaseLines";

const line = (p: Partial<PurchaseLine>): PurchaseLine => ({
  date: "2026-10-01", supplier: "業務スーパー", name: "薄力粉 1kg", genericName: "", quantity: 1, unitPrice: 298, amount: 298,
  taxRate: 8, taxIncluded: true, ref: "", ...p,
});

describe("仕入れ明細ファイル", () => {
  it("書き出して読み直すと同じになる（カンマ・引用符の入った品名も）", () => {
    const lines = [line({ name: 'よつ葉バター "食塩不使用", 450g', genericName: "無塩バター", ref: "abc" }), line({ amount: -50, unitPrice: null, quantity: null, taxIncluded: false, taxRate: 10 })];
    const csv = toPurchaseCsv(lines);
    expect(csv.startsWith("﻿日付,仕入れ先,品名")).toBe(true);
    expect(parsePurchaseCsv(csv)).toEqual({ lines, skipped: 0 });
  });

  it("列の順番が違う・足りない手作りの CSV も読める。日付の / や1桁の月も直す", () => {
    const r = parsePurchaseCsv("品名,金額,日付\r\nグラニュー糖,\"1,280\",2026/9/5\r\n,100,\r\n");
    expect(r.skipped).toBe(1);
    expect(r.lines[0]).toMatchObject({ name: "グラニュー糖", amount: 1280, date: "2026-09-05", taxRate: 8, taxIncluded: true });
  });

  it("品名や金額の列が無いファイルはエラー", () => {
    expect(() => parsePurchaseCsv("a,b\n1,2")).toThrow();
  });

  it("100gあたりの税抜の値段（個・枚は出さない）", () => {
    expect(per100(1080, 0.08, 1, "kg")).toBe(100);
    expect(per100(540, 0, 450, "g")).toBe(120);
    expect(per100(300, 0, 10, "枚")).toBeNull();
    // 1つの重さが分かれば個でも出す（卵10個 330円・1個50g → 66円）
    expect(per100(330, 0, 10, "個", 50)).toBe(66);
  });

  it("品名から包装の量を読む", () => {
    expect(sizeFromName("よつ葉バター 450g")).toEqual({ qty: 450, unit: "g" });
    expect(sizeFromName("牛乳１Ｌ")).toEqual({ qty: 1, unit: "l" });
    expect(sizeFromName("卵")).toBeNull();
    expect(sizeFromName("生クリーム200ml×3")).toEqual({ qty: 600, unit: "ml" });
    expect(sizeFromName("ﾁｮｺ 3x200g")).toEqual({ qty: 600, unit: "g" });
    expect(sizeFromName("たまご 10個入")).toEqual({ qty: 10, unit: "個" });
    expect(sizeFromName("ポーションバター 6P")).toEqual({ qty: 6, unit: "個" });
  });

  it("量をAIに確かめる行（量が分からない・1つの重さが分からない・前の100gあたりと大きく違う）", () => {
    const l = { price: 540, tax: 0, qty: 1, unit: "個" as const };
    expect(sizeDoubt({ ...l, size: "none" })).toBe("量が分からない");
    expect(sizeDoubt({ ...l, size: "edited" })).toBeNull();
    expect(sizeDoubt({ ...l, qty: 10, size: "printed" })).toBe("1つの重さが分からない");
    expect(sizeDoubt({ ...l, qty: 10, size: "printed", gramsPerPiece: 50 })).toBeNull();
    const ing = { purchasePrice: 540, purchaseQty: 450, purchaseUnit: "g" as const };
    expect(sizeDoubt({ price: 540, tax: 0, qty: 450, unit: "g", size: "printed" }, ing)).toBeNull();
    expect(sizeDoubt({ price: 540, tax: 0, qty: 45, unit: "g", size: "printed" }, ing)).toMatch(/10倍/);
  });

  it("ネットで確かめる行と、共有の量の表の使い方", () => {
    const l = { price: 540, tax: 0, qty: 450, unit: "g" as const };
    expect(needsWebSize({ ...l, size: "price" })).toBe(true);
    expect(needsWebSize({ ...l, size: "known" })).toBe(false);
    expect(needsWebSize({ ...l, size: "web" })).toBe(false);
    expect(needsWebSize({ ...l, size: "edited" })).toBe(false);
    // 量の書き方が違っても同じ商品は同じキー
    expect(productSizeKey("ﾖﾂﾊﾞﾊﾞﾀｰ 食塩不使用 450g")).toBe(productSizeKey("ﾖﾂﾊﾞﾊﾞﾀｰ食塩不使用"));
    // 値段が大きく違えば容量違いかもしれないので使わない（税込を税抜に直して比べる）
    expect(sameSizePrice(1000, 1080, 0.08)).toBe(true);
    expect(sameSizePrice(1000, 500, 0)).toBe(false);
  });

  it("個で買う材料は、1つの重さを材料に写す（お店が入れた値は変えない）", () => {
    const line = { price: 330, qty: 10, unit: "個" as const, tax: 0, supplier: "", raw: "卵10個", gramsPerPiece: 50 };
    expect(invoicePatch(line, { name: "卵" }).gramsPerPiece).toBe(50);
    expect(invoicePatch(line, { name: "卵", gramsPerPiece: 55 }).gramsPerPiece).toBeUndefined();
    expect(invoicePatch({ ...line, unit: "g", qty: 500 }, { name: "卵" }).gramsPerPiece).toBeUndefined();
  });

  it("同じ品名は一番新しい値段だけ。名前・別名・一般的な名前で結び、値引きは入れない", () => {
    const ings = [{ id: "a", name: "薄力粉", aliases: ["薄力粉 1kg"] }, { id: "b", name: "無塩バター", aliases: [] }];
    const out = fromPurchaseLines([
      line({ date: "2026-09-01", unitPrice: 280, amount: 280 }),
      line({ date: "2026-10-01" }),
      line({ name: "ﾖﾂﾊﾞ食塩不使用450g", genericName: "無塩バター", unitPrice: null, quantity: 2, amount: 1500 }),
      line({ name: "値引き", amount: -50, unitPrice: -50 }),
      line({ name: "クッキングシート" }),
    ], ings);
    expect(out).toHaveLength(3);
    expect(out.find((l) => l.raw === "薄力粉 1kg")).toMatchObject({ price: 298, count: 2, qty: 1, unit: "kg", tax: 0.08, ingredientId: "a", confidence: 1, photo: -1 });
    expect(out.find((l) => l.raw.startsWith("ﾖﾂﾊﾞ"))).toMatchObject({ price: 750, ingredientId: "b", qty: 450, unit: "g", generic: "無塩バター", via: "name" });
    expect(out.find((l) => l.raw === "クッキングシート")?.ingredientId).toBeNull();
  });
});

describe("自動で受け取る明細", () => {
  it("形を確かめて直す（品名・金額が無い行は捨てる、税率は 0・8・10 だけ）", async () => {
    const { cleanPurchaseLine } = await import("./purchaseLines");
    expect(cleanPurchaseLine({ name: " 薄力粉 ", amount: 298, taxRate: 7, date: "2026-10-01", taxIncluded: false, extra: 1 })).toEqual({
      date: "2026-10-01", supplier: "", name: "薄力粉", genericName: "", quantity: null, unitPrice: null, amount: 298, taxRate: 8, taxIncluded: false, ref: "",
    });
    expect(cleanPurchaseLine({ name: "", amount: 1 })).toBeNull();
    expect(cleanPurchaseLine({ name: "a", amount: "1" })).toBeNull();
    expect(cleanPurchaseLine("x")).toBeNull();
  });
});
