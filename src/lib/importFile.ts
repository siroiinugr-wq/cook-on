// 取り込むファイルを「文字」にする。形式は問わない（CSV・Excel・メモ書き）。表の形はAIが読み解く
// - Excel：シートごとに「### シート名」の見出しを付け、列はタブ区切りの行にする
// - CSV・テキスト：Excel で作った CSV は Shift_JIS のことが多いので、UTF-8 で読めなければ Shift_JIS で読み直す
// 画像やPDFは今は対象外（文字にしてから貼ってもらう）

import { isNumbersExport, looksNumbersCsv, numbersExportToText } from "@shared/numbersExport";

const EXCEL = /\.(xlsx|xlsm)$/i;
const TEXT = /\.(csv|tsv|txt|md|text)$/i;

export const ACCEPT = ".xlsx,.xlsm,.csv,.tsv,.txt,.md,.numbers";

async function decode(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

async function excelToText(file: File): Promise<string> {
  // 使うときだけ読み込む（取り込み画面を開かない人のぶん、最初の表示を軽くする）。ファイルは1回だけ開く（lib/xlsxLite.ts）
  const { readXlsx } = await import("./xlsxLite");
  const sheets = readXlsx(new Uint8Array(await file.arrayBuffer()));
  // Numbers から書き出した Excel：レシピ名＝シート名ごとに、何個分と仕込み量の表だけにする（shared/numbersExport.ts）
  if (isNumbersExport(sheets.map((s) => s.name))) return numbersExportToText(sheets);
  const parts: string[] = [];
  for (const { name, rows } of sheets) {
    const lines = rows
      .map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).replace(/\s+/g, " "))).join("\t").replace(/\t+$/, ""))
      .filter((l) => l.trim());
    if (lines.length) parts.push(`### ${name}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export async function fileToText(file: File): Promise<string> {
  if (EXCEL.test(file.name)) return excelToText(file);
  if (/\.xls$/i.test(file.name)) throw new Error("古い Excel 形式（.xls）は読めません。Excel で「.xlsx」か「CSV」で保存し直してください。");
  if (/\.numbers$/i.test(file.name)) throw new Error("Numbers のファイルはそのままでは読めません。Numbers の「ファイル → 書き出す → Excel」で .xlsx にしてから選んでください（シートの名前＝レシピ名が残ります）。");
  if (TEXT.test(file.name) || file.type.startsWith("text/")) {
    const text = await decode(file);
    // Numbers の CSV にはシートの名前（レシピ名）が入らない。Excel で書き出してもらう
    if (looksNumbersCsv(text)) throw new Error("この CSV は Numbers から書き出したもので、レシピ名（シートの名前）が入っていません。Numbers の「ファイル → 書き出す → Excel」で .xlsx にして選んでください。");
    return text;
  }
  throw new Error("CSV・Excel（.xlsx）・テキストのファイルを選んでください。PDFや画像は、文字をコピーして下の欄に貼ってください。");
}
