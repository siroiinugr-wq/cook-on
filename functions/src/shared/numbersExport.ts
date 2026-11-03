// Numbers から書き出した Excel（.xlsx）を、レシピごとの文字にする（2026-11-03、MASA の「焼菓子レシピブック」）。
// Numbers は「1レシピ＝1シート」で、レシピ名はシートの名前。Excel にすると表ごとに「レシピ名 - 表名」のワークシートになる：
//   表1（「18 個分」）・レシピ（仕込み量の表）・レシピ-1（1個分の表＝同じ材料の繰り返し）・描画（図）
// CSV に書き出すとシート名が消えてレシピ名が無くなる（最初の取り込みでタイトルが入らなかった原因）ので、Excel を使ってもらう。
// ここでは、レシピ名ごとに「何個分」と仕込み量の表（材料・分量・単位・備考）だけにする。1個分の表・栄養の列・空の行・合計の行は入れない。

export type Cell = string | number | boolean | null | undefined;
export interface Sheet { name: string; rows: Cell[][] }

/** Numbers の書き出しか（最初のシートが「書き出しの概要」、またはワークシート名が「〜 - 表名」の形ばかり） */
export function isNumbersExport(names: string[]): boolean {
  if (names[0] === "書き出しの概要") return true;
  const dashed = names.filter((n) => / - [^-]+$/.test(n)).length;
  return names.length >= 4 && dashed / names.length >= 0.8;
}

const SKIP_GROUPS = /^(目次|材料|テンプレ|テンプレート|書き出しの概要)$/;
const text = (c: Cell) => (c === null || c === undefined ? "" : String(c).replace(/\s+/g, " ").trim());

/** 表の見出しの行と、材料・分量・単位・備考の列の位置 */
function columns(rows: Cell[][]): { head: number; name: number; qty: number; unit: number; note: number } | null {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const h = rows[i].map(text);
    const name = h.findIndex((x) => /^(材料|材料名|食材)$/.test(x));
    const qty = h.findIndex((x) => /^(分量|量|重量|g)$/.test(x));
    if (name < 0 || qty < 0) continue;
    // 単位は分量のすぐ右（見出しが空のことが多い）
    const unitAt = h.findIndex((x) => /^単位$/.test(x));
    const unit = unitAt >= 0 ? unitAt : qty + 1;
    return { head: i, name, qty, unit, note: h.findIndex((x) => /^(備考|メモ|注)$/.test(x)) };
  }
  return null;
}

function recipeTable(rows: Cell[][]): string[] {
  const c = columns(rows);
  if (!c) return rows.map((r) => r.map(text).join("\t").replace(/\t+$/, "")).filter((l) => l.trim());
  const out = ["材料\t分量\t単位\t備考"];
  for (const r of rows.slice(c.head + 1)) {
    const name = text(r[c.name]);
    if (!name || /^(合計|計|小計|total)$/i.test(name)) continue;
    const qty = text(r[c.qty]);
    const note = c.note >= 0 ? text(r[c.note]) : "";
    out.push([name, qty, qty ? text(r[c.unit]) : "", note].join("\t").replace(/\t+$/, ""));
  }
  return out.length > 1 ? out : [];
}

/** 表1（「18 | 個分」「24 | | 24個分」）から何個分の文字 */
function yieldText(rows: Cell[][]): string {
  const cells = rows.flat().map(text).filter(Boolean);
  const joined = cells.join(" ");
  const m = /(\d+(?:\.\d+)?)\s*(個|枚|本|台|切れ|人)分?/.exec(joined) ?? /(\d+(?:\.\d+)?)\s*(?:\S*\s+)?(個|枚|本|台|切れ|人)分/.exec(joined);
  if (m) return `${m[1]}${m[2]}分`;
  return joined.slice(0, 40);
}

/** Numbers の書き出しのシートを、レシピごとの「### レシピ名」の文字にする */
export function numbersExportToText(sheets: Sheet[]): string {
  const groups = new Map<string, Map<string, Cell[][]>>();
  for (const s of sheets) {
    const at = s.name.lastIndexOf(" - ");
    if (at < 0) continue;
    const g = s.name.slice(0, at).trim();
    const table = s.name.slice(at + 3).trim();
    if (SKIP_GROUPS.test(g)) continue;
    if (!groups.has(g)) groups.set(g, new Map());
    groups.get(g)!.set(table, s.rows);
  }
  const parts: string[] = [];
  for (const [name, tables] of groups) {
    // 仕込み量の表：「レシピ」。無ければ「-1」の付かない最初の表（表1・描画は除く）
    const mainKey = tables.has("レシピ") ? "レシピ" : [...tables.keys()].find((k) => !/-\d+$/.test(k) && !/^表\d+$/.test(k) && k !== "描画");
    const main = mainKey ? recipeTable(tables.get(mainKey)!) : [];
    if (!main.length) continue;
    const y = tables.has("表1") ? yieldText(tables.get("表1")!) : "";
    parts.push([`### ${name}`, y ? `【何個分】${y}` : "", ...main].filter(Boolean).join("\n"));
  }
  return parts.join("\n\n");
}

/** Numbers から書き出した CSV らしいか（レシピ名の無い「材料,分量,,,索引」の表が何度も出てくる） */
export function looksNumbersCsv(text: string): boolean {
  return (text.match(/^材料,分量,[^\n]*索引/gm) ?? []).length >= 3;
}
