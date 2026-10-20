// 取り込むファイルを「文字」にする。形式は問わない（CSV・Excel・メモ書き）。表の形はAIが読み解く
// - Excel：シートごとに「### シート名」の見出しを付け、列はタブ区切りの行にする
// - CSV・テキスト：Excel で作った CSV は Shift_JIS のことが多いので、UTF-8 で読めなければ Shift_JIS で読み直す
// 画像やPDFは今は対象外（文字にしてから貼ってもらう）

const EXCEL = /\.(xlsx|xlsm)$/i;
const TEXT = /\.(csv|tsv|txt|md|text)$/i;

export const ACCEPT = ".xlsx,.xlsm,.csv,.tsv,.txt,.md";

async function decode(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

async function excelToText(file: File): Promise<string> {
  // 使うときだけ読み込む（取り込み画面を開かない人のぶん、最初の表示を軽くする）
  const { default: readXlsxFile, readSheetNames } = await import("read-excel-file");
  const names = await readSheetNames(file);
  const parts: string[] = [];
  for (const name of names) {
    const rows = await readXlsxFile(file, { sheet: name });
    const lines = rows
      .map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).replace(/\s+/g, " "))).join("\t").replace(/\t+$/, ""))
      .filter((l) => l.trim());
    if (lines.length) parts.push(`### ${name}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

export async function fileToText(file: File): Promise<string> {
  if (EXCEL.test(file.name)) return excelToText(file);
  if (/\.xls$/i.test(file.name)) throw new Error("古い Excel 形式（.xls）は読めません。Excel で「.xlsx」か「CSV」で保存し直してください。");
  if (TEXT.test(file.name) || file.type.startsWith("text/")) return decode(file);
  throw new Error("CSV・Excel（.xlsx）・テキストのファイルを選んでください。PDFや画像は、文字をコピーして下の欄に貼ってください。");
}
