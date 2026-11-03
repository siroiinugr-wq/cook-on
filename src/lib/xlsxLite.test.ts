import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readXlsx } from "./xlsxLite";
import { isNumbersExport, numbersExportToText } from "@shared/numbersExport";
import { splitForImport } from "@shared/credits";

function book(sheets: Record<string, string>): Uint8Array {
  const names = Object.keys(sheets);
  return zipSync({
    "xl/workbook.xml": strToU8(`<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>材料</t></si><si><t>分量</t></si><si><t>薄力粉</t><rPh><t>ハクリキコ</t></rPh></si><si><t>個分</t></si><si><t>g</t></si></sst>`),
    ...Object.fromEntries(names.map((n, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(sheets[n])])),
  });
}

describe("xlsx を1回で読む・Numbers の書き出し", () => {
  const x = book({
    "書き出しの概要": `<worksheet><sheetData/></worksheet>`,
    "マドレーヌ - 表1": `<worksheet><sheetData><row r="1"><c r="A1"><v>18</v></c><c r="B1" t="s"><v>3</v></c></row></sheetData></worksheet>`,
    "マドレーヌ - レシピ": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>300</v></c><c r="C2" t="s"><v>4</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>合計</t></is></c><c r="B3"><v>300</v></c></row></sheetData></worksheet>`,
  });
  it("シートの名前と中身（ふりがなは除く）", () => {
    const s = readXlsx(x);
    expect(s.map((v) => v.name)).toEqual(["書き出しの概要", "マドレーヌ - 表1", "マドレーヌ - レシピ"]);
    expect(s[2].rows[1]).toEqual(["薄力粉", 300, "g"]);
  });
  it("レシピ名＝シート名、何個分、合計の行は入れない", () => {
    const s = readXlsx(x);
    expect(isNumbersExport(s.map((v) => v.name))).toBe(true);
    expect(numbersExportToText(s)).toBe("### マドレーヌ\n【何個分】18個分\n材料\t分量\t単位\t備考\n薄力粉\t300\tg");
  });
  // MASA の本物のファイルがあるときだけ（手元の確かめ用）
  const real = "/tmp/claude-0/book.xlsx";
  it.skipIf(!existsSync(real))("焼菓子レシピブック", () => {
    const s = readXlsx(new Uint8Array(readFileSync(real)));
    const text = numbersExportToText(s);
    const chunks = splitForImport(text);
    console.log("シート", s.length, "レシピ", (text.match(/^### /gm) ?? []).length, "文字", text.length, "塊", chunks.length);
    expect(chunks.every((c) => c.startsWith("### "))).toBe(true);
  });
});
