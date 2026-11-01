import { describe, expect, it } from "vitest";
import { invoicePatch } from "./invoice";

describe("レシートから仕入れ値", () => {
  it("税込の値段を税抜に直し、参考価格の印を消し、レシートの表記を別名に覚える", () => {
    const p = invoicePatch({ raw: "よつ葉バター食塩不使用450g", price: 1296, qty: 450, unit: "g", tax: 0.08, supplier: "製菓材料店" }, { name: "無塩バター", aliases: [] });
    expect(p).toMatchObject({ purchasePrice: 1200, priceTax: 0.08, purchaseQty: 450, purchaseUnit: "g", priceSource: null, aliases: ["よつ葉バター食塩不使用450g"], supplier: "製菓材料店" });
  });
  it("仕入れ先が入っていれば上書きしない", () => {
    const p = invoicePatch({ raw: "無塩バター", price: 1000, qty: 1, unit: "kg", tax: 0, supplier: "A" }, { name: "無塩バター", supplier: "B" });
    expect(p.supplier).toBeUndefined();
    expect(p.aliases).toBeUndefined();
  });
});
