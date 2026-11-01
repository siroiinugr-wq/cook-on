import { describe, expect, it } from "vitest";
import { fromPurchaseLines, per100, sizeFromName } from "./invoice";
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
  });

  it("品名から包装の量を読む", () => {
    expect(sizeFromName("よつ葉バター 450g")).toEqual({ qty: 450, unit: "g" });
    expect(sizeFromName("牛乳１Ｌ")).toEqual({ qty: 1, unit: "l" });
    expect(sizeFromName("卵")).toBeNull();
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
