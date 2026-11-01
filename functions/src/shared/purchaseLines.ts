// 仕入れ明細ファイル（CSV）の形。AI経理が「仕入れ明細を書き出す」で作り、COOK ON が「仕入れ明細ファイルを読み込む」で読む。
// 同じ内容のファイルが ai-accounting と cook-on の両方の functions/src/shared/purchaseLines.ts にある。変えるときは両方を同じに直す。
// 別々のアプリなので、つながりはこのファイルの形だけ（おたがいのデータベースは見ない）。Excel でも開けて、手で作った CSV でも読める。

/** 列の名前（この順で書く。読むときは名前で探すので、順番が違っても・列が足りなくても読める） */
export const PURCHASE_COLUMNS = ["日付", "仕入れ先", "品名", "一般的な名前", "数量", "単価", "金額", "税率", "税", "レシート番号"] as const;
/** ファイル名に入れる言葉（「会社名_仕入れ明細_2026-09_2026-10.csv」） */
export const PURCHASE_FILE_LABEL = "仕入れ明細";

/** 明細1行 */
export interface PurchaseLine {
  /** YYYY-MM-DD（分からなければ空） */
  date: string;
  supplier: string;
  /** レシートに印字された品名 */
  name: string;
  /** 商品名から分かる一般的な品名（クックパー → クッキングシート）。無ければ空 */
  genericName: string;
  quantity: number | null;
  /** 1つあたりの値段（円） */
  unitPrice: number | null;
  /** その行の金額（円。値引きは負の数） */
  amount: number;
  /** 消費税率（%。8・10・0） */
  taxRate: number;
  /** 単価・金額に消費税が入っているか（true＝税込、false＝税抜） */
  taxIncluded: boolean;
  /** 元のレシートを見分ける番号（書き出したアプリの中の番号。無ければ空） */
  ref: string;
}

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV にする（Excel で文字化けしないよう先頭に BOM、改行は CRLF） */
export function toPurchaseCsv(lines: PurchaseLine[]): string {
  const rows = lines.map((l) => [l.date, l.supplier, l.name, l.genericName, l.quantity, l.unitPrice, l.amount, l.taxRate, l.taxIncluded ? "税込" : "税抜", l.ref].map(cell).join(","));
  return `﻿${[PURCHASE_COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

/** CSV を行と列に分ける（"…" の中のカンマ・改行・"" に対応） */
function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}

const num = (s: string | undefined) => {
  const t = (s ?? "").replace(/[,，円¥￥\s]/g, "").replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * 仕入れ明細ファイルを読む。品名と（金額か単価）の列が無ければ、この形のファイルではないとしてエラー。
 * 読めない行（品名が空・金額も単価も無い）は skipped に数える
 */
export function parsePurchaseCsv(text: string): { lines: PurchaseLine[]; skipped: number } {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  const head = (rows[0] ?? []).map((h) => h.trim());
  const at = (name: string) => head.indexOf(name);
  const col = Object.fromEntries(PURCHASE_COLUMNS.map((c) => [c, at(c)])) as Record<(typeof PURCHASE_COLUMNS)[number], number>;
  if (col["品名"] < 0 || (col["金額"] < 0 && col["単価"] < 0)) {
    throw new Error("仕入れ明細ファイルではないようです（1行目に「品名」と「金額」の列が要ります）。");
  }
  const get = (r: string[], c: (typeof PURCHASE_COLUMNS)[number]) => (col[c] >= 0 ? (r[col[c]] ?? "").trim() : "");
  const lines: PurchaseLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const name = get(r, "品名");
    const quantity = num(get(r, "数量"));
    const unitPrice = num(get(r, "単価"));
    const amount = num(get(r, "金額")) ?? (unitPrice !== null ? unitPrice * (quantity ?? 1) : null);
    if (!name || amount === null) { skipped++; continue; }
    const rate = num(get(r, "税率"));
    const date = get(r, "日付").replace(/\//g, "-");
    lines.push({
      date: /^\d{4}-\d{1,2}-\d{1,2}$/.test(date) ? date.replace(/-(\d)(?!\d)/g, "-0$1") : "",
      supplier: get(r, "仕入れ先").slice(0, 60),
      name: name.slice(0, 80),
      genericName: get(r, "一般的な名前").slice(0, 60),
      quantity, unitPrice, amount,
      taxRate: rate === 0 || rate === 8 || rate === 10 ? rate : 8,
      taxIncluded: get(r, "税") !== "税抜",
      ref: get(r, "レシート番号").slice(0, 60),
    });
  }
  return { lines, skipped };
}
