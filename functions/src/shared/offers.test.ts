import { describe, expect, it } from "vitest";
import { cheapestPer100, offerPatch, rankOffers, type WebOffer } from "./offers";

const o = (p: Partial<WebOffer>): WebOffer => ({ shop: "A", product: "きび砂糖 1kg", price: 540, qty: 1, unit: "kg", url: null, note: "", ...p });

describe("ネットの売り場を比べる", () => {
  it("100gあたりの安い順に並べ、今の仕入れ値（税抜）と比べる。100gあたりが出ないものは後ろ", () => {
    const list = [o({ shop: "A" }), o({ shop: "B", price: 1350, qty: 3 }), o({ shop: "C", price: 300, qty: 10, unit: "個" })];
    const r = rankOffers(list, { purchasePrice: 500, purchaseQty: 1, purchaseUnit: "kg" });
    expect(r.map((x) => x.shop)).toEqual(["B", "A", "C"]);
    expect(r[0].per100).toBe(41.7); // 1350円（税込8%）→ 税抜 1250円 ÷ 3kg → 100gあたり約41.7円
    expect(r[1].diff).toBe(0); // 540円（税込）＝税抜500円/kg、今と同じ
    expect(r[2].per100).toBeNull();
  });

  it("いちばん安い100gあたりと、仕入れ値にするときの書き換え", () => {
    expect(cheapestPer100({ list: [o({}), o({ price: 1350, qty: 3 })], at: "", searchHtml: "" })).toBe(41.7);
    expect(cheapestPer100(null)).toBeNull();
    expect(offerPatch(o({ shop: "cotta" }))).toMatchObject({ purchasePrice: 500, priceTax: 0.08, purchaseQty: 1, purchaseUnit: "kg", supplier: "cotta", priceSource: null });
  });
});
