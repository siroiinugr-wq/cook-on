// 軽い .xlsx の読み方：ファイルを1回だけ開いて、全部のシートを読む。
// read-excel-file はシートを1つ読むたびにファイル全体を開き直すので、Numbers から書き出した数百シートの Excel（16MB・画像入り）では
// とても遅く、文字の入っていないセルで止まることもあった（2026-11-03、MASA の「焼菓子レシピブック」543シート）。
// 画像は開かず、表の XML だけを読む。数式は計算済みの値、日付は数のまま（レシピの取り込みでは使わない）。
import { unzipSync, strFromU8 } from "fflate";

export type XCell = string | number | boolean | null;
export interface XSheet { name: string; rows: XCell[][] }

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m);
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** <si> や <is> の中の文字（ふりがな <rPh> は除く） */
function textOf(xml: string): string {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
}

/** 列の文字（A・AB）を0始まりの番号に */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): XCell[][] {
  const rows: XCell[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(attr(rm[1], "r") ?? rows.length + 1) - 1;
    const row: XCell[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], "r");
      const at = ref ? colIndex(ref) : row.length;
      const t = attr(cm[1], "t");
      const inner = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val: XCell = null;
      if (t === "s") val = v !== undefined ? shared[Number(v)] ?? "" : null;
      else if (t === "inlineStr") val = textOf(inner);
      else if (t === "str" || t === "e") val = v !== undefined ? unescape(v) : null;
      else if (t === "b") val = v === "1";
      else if (v !== undefined && v !== "") val = Number(v);
      row[at] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[r] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** .xlsx の中身（バイト）から全部のシートを読む */
export function readXlsx(data: Uint8Array): XSheet[] {
  const files = unzipSync(data, { filter: (f) => /\.(xml|rels)$/.test(f.name) && !/^xl\/(drawings|media|charts)\//.test(f.name) });
  const get = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const shared = [...get("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = new Map([...get("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  const out: XSheet[] = [];
  for (const m of get("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescape(attr(m[0], "name") ?? "");
    const target = rels.get(attr(m[0], "r:id") ?? "") ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    out.push({ name, rows: parseSheet(get(path), shared) });
  }
  return out;
}
