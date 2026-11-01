import { describe, expect, it } from "vitest";
import { linkPatch } from "./link";
import { buildSuggestion } from "./suggest";
import type { GlobalIngredient, Ingredient } from "./types";

const g: GlobalIngredient = { id: "base_butter_unsalted", name: "無塩バター", aliases: ["食塩不使用バター"], category: "乳類", allergens: ["milk"], source: "base",
  refPrice: { price: 614, qty: 200, unit: "g", item: "バター", area: "特別区部", asOf: "2026-09", source: "総務省「小売物価統計調査」" } };
const ing = (p: Partial<Ingredient> = {}): Ingredient => ({ id: "i1", name: "よつ葉バター", purchasePrice: null, purchaseQty: 1, purchaseUnit: "kg", allergens: [], ...p });

describe("共有の材料に結ぶ", () => {
  it("値段が空なら参考価格（税抜）を入れて印を付け、アレルゲンは足す", () => {
    const p = linkPatch(ing(), g);
    expect(p).toMatchObject({ globalRef: g.id, allergens: ["milk"], allergensConfirmed: false, purchasePrice: 568.5, purchaseQty: 200, purchaseUnit: "g", priceSource: "ref" });
  });
  it("値段があれば触らない", () => {
    const p = linkPatch(ing({ purchasePrice: 1200, allergens: ["milk"] }), g);
    expect(p.purchasePrice).toBeUndefined();
    expect(p.allergensConfirmed).toBeUndefined();
  });
});

describe("共有の材料への提案", () => {
  it("確かめていない材料は出さない", () => {
    expect(buildSuggestion(ing(), g)).toBeNull();
  });
  it("新しい呼び方と自分の仕入れ値を出す。参考価格を写しただけの値段は出さない", () => {
    const s = buildSuggestion(ing({ allergensConfirmed: true, allergens: ["milk"], purchasePrice: 1300, purchaseQty: 450, purchaseUnit: "g", globalRef: g.id }), g)!;
    expect(s.kind).toBe("update");
    expect(s.aliases).toEqual(["よつ葉バター"]);
    expect(s.allergens).toBeNull();
    expect(s.price).toMatchObject({ price: 1300, qty: 450 });
    const r = buildSuggestion(ing({ name: "無塩バター", allergensConfirmed: true, allergens: ["milk"], purchasePrice: 568.5, priceSource: "ref", globalRef: g.id }), g);
    expect(r).toBeNull();
  });
  it("共有に無い材料は new で出す", () => {
    const s = buildSuggestion(ing({ name: "ピスタチオペースト", allergensConfirmed: true, allergens: [] }), null)!;
    expect(s.kind).toBe("new");
  });
});

import { buildIndex } from "./matchKey";
import { misLinked } from "./link";
describe("結び先の見直し", () => {
  it("名前がほかの共有の材料とぴったり同じなら、見直しの候補に出す", () => {
    const index = buildIndex([{ id: "u", name: "無塩バター", aliases: ["食塩不使用バター"] }, { id: "f", name: "発酵バター", aliases: [] }]);
    const r = misLinked([{ id: "1", name: "発酵バター", globalRef: "u" }, { id: "2", name: "食塩不使用バター", globalRef: "u" }], index);
    expect(r.map((x) => [x.ing.id, x.to.id])).toEqual([["1", "f"]]);
  });
});
