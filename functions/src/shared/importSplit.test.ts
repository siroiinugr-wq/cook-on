import { describe, expect, it } from "vitest";
import { CONTINUED, parseDelimited, splitImportText, titleColumn } from "./importSplit";

describe("取り込みの分け方", () => {
  it("引用符の中の改行・カンマ・\"\" を正しく読む", () => {
    expect(parseDelimited('a,"b\nc","d,""e"""\nf,g,h', ",")).toEqual([["a", "b\nc", 'd,"e"'], ["f", "g", "h"]]);
  });
  it("見出しからレシピ名の列を探す", () => {
    expect(titleColumn(["分類", "レシピ名", "材料"])).toBe(1);
    expect(titleColumn(["カテゴリ", "名前", "材料"])).toBe(1);
    expect(titleColumn(["a", "b"])).toBe(-1);
  });
  it("CSVはどの塊にも見出しが付き、レシピの途中では切らない。欄の中の改行では切らない", () => {
    const header = "レシピ名,材料,分量,作り方";
    const rows: string[] = [];
    for (let r = 0; r < 60; r++) {
      for (let k = 0; k < 8; k++) rows.push(`${k === 0 ? `ケーキ${r}` : ""},材料${k},${k * 10}g,${k === 0 ? '"混ぜる\n焼く"' : ""}`);
    }
    // レシピ名が最初の行だけに書いてある形：名前の無い行は前のレシピの続き
    const chunks = splitImportText([header, ...rows].join("\n"), 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.startsWith("【表の見出し】レシピ名\t材料\t分量\t作り方\n")).toBe(true);
      expect(c.length).toBeLessThanOrEqual(2000);
      // 塊の1行目（見出しの次）は必ずレシピの頭
      expect(c.split("\n")[1]).toMatch(/^ケーキ\d+\t/);
      expect(c.includes(CONTINUED)).toBe(false);
    }
    expect(chunks.join("\n")).toContain("混ぜる / 焼く");
    // 60件のレシピがすべて、どこかの塊に1回ずつ入る
    const heads = chunks.flatMap((c) => c.split("\n").filter((l) => /^ケーキ\d+\t/.test(l)));
    expect(heads).toHaveLength(60);
  });
  it("毎行にレシピ名がある形は、名前が変わる所で切る", () => {
    const rows = ["名前\t材料\t分量"];
    for (let r = 0; r < 40; r++) for (let k = 0; k < 6; k++) rows.push(`クッキー${r}\t材料${k}\t${k}g`);
    const chunks = splitImportText(rows.join("\n"), 1000);
    for (const c of chunks) {
      const body = c.split("\n").slice(1);
      const names = [...new Set(body.map((l) => l.split("\t")[0]))];
      // どのレシピも1つの塊の中に6行そろっている
      for (const n of names) expect(body.filter((l) => l.startsWith(`${n}\t`))).toHaveLength(6);
    }
  });
  it("1つのレシピが大きすぎるときだけ、続きの塊に印を付ける", () => {
    const rows = ["レシピ名,材料"];
    rows.push("大きなレシピ,材料0");
    for (let k = 1; k < 300; k++) rows.push(`,とても長い材料の名前${k}`);
    const chunks = splitImportText(rows.join("\n"), 1500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].includes(CONTINUED)).toBe(false);
    expect(chunks.slice(1).every((c) => c.split("\n")[1] === CONTINUED)).toBe(true);
  });
  it("Excel はシートごとに見出しを付ける", () => {
    const text = "### 焼菓子\nレシピ名\t材料\nA\tx\n\n### ケーキ\nレシピ名\t材料\nB\ty";
    const chunks = splitImportText(text, 6000);
    expect(chunks).toEqual(["### 焼菓子\n【表の見出し】レシピ名\t材料\nA\tx", "### ケーキ\n【表の見出し】レシピ名\t材料\nB\ty"]);
  });
});
