import { describe, expect, it } from "vitest";
import { suggestionRefPrice } from "./suggest";

describe("提案から参考価格", () => {
  const base = { name: "アーモンドプードル", price: { price: 1000, qty: 1, unit: "kg" as const }, note: "" };
  it("税抜の提案を税込に直し、出どころを書き分ける", () => {
    expect(suggestionRefPrice({ ...base, source: "shop" }, "2026-11")).toMatchObject({ price: 1080, source: "COOK ON のお店の仕入れ値（運営が確認）" });
    expect(suggestionRefPrice({ ...base, source: "ai" }, "2026-11")?.source).toBe("AIの推定（運営が確認）");
    expect(suggestionRefPrice({ ...base, source: "ai", sources: [{ uri: "https://example.com", title: "x" }] }, "2026-11")).toMatchObject({
      source: "ネットの販売価格をAIが調べた目安（運営が確認）", area: "ネットのお店の相場",
    });
  });
});
