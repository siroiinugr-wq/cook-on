// 2026-11-03 の見直し：仕入れの除外・成分表の名前・gに直せない材料の目安
import { describe, expect, it } from "vitest";
import { fromPurchaseLines, ignoreKey, looksNonFood } from "./invoice";
import { looksMextName, plainFoodName, shopNameFor } from "./mext";
import { typicalPieceGrams } from "./units";

describe("仕入れの除外", () => {
  it("材料でない品を名前で見分ける", () => {
    for (const n of ["ゴミ袋 45L", "レジ袋", "ライトニングケーブル", "ﾌｧﾐﾁｷ"]) expect(looksNonFood(n)).toBe(true);
    for (const n of ["薄力粉 1kg", "キャベツ", "絹豆腐"]) expect(looksNonFood(n)).toBe(false);
  });
  it("除外の目印は量・数を外して同じ品にそろえる", () => {
    expect(ignoreKey("ゴミ袋 45L 10枚")).toBe(ignoreKey("ゴミ袋 45L 20枚"));
  });
  it("ファイルの行で材料でない品には印を付ける", () => {
    const got = fromPurchaseLines([
      { date: "2026-11-01", supplier: "ファミマ", name: "ファミチキ", genericName: "", quantity: 1, unitPrice: 220, amount: 220, taxRate: 8, taxIncluded: true },
    ] as never, []);
    expect(got[0].notIngredient).toBe(true);
  });
});

describe("成分表の名前", () => {
  it("分類の見出しと状態を外す", () => {
    expect(plainFoodName("（キャベツ類） キャベツ 結球葉 生")).toBe("キャベツ 結球葉");
    expect(looksMextName("＜野菜類＞ キャベツ")).toBe(true);
    expect(looksMextName("キャベツ")).toBe(false);
  });
  it("新しく作る材料はお店の呼び方を使う", () => {
    expect(shopNameFor("mext_06061", "（キャベツ類） キャベツ 結球葉 生", "キャベツ")).toBe("キャベツ");
    expect(shopNameFor("mext_06061", "（キャベツ類） キャベツ 結球葉 生", "")).toBe("キャベツ 結球葉");
    expect(shopNameFor("base_flour", "薄力粉", "ﾊｸﾘｷｺ")).toBe("薄力粉");
  });
});

describe("1つの重さの目安", () => {
  it("よく使う材料", () => {
    expect(typicalPieceGrams("牛乳")).toBe(1030);
    expect(typicalPieceGrams("きび砂糖")).toBe(1000);
    expect(typicalPieceGrams("謎の粉")).toBeNull();
  });
});
