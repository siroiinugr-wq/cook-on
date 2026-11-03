// 取り込む文字を、AIに渡す塊（IMPORT_CHUNK_CHARS 字まで）に分ける。見積り（画面）と実際の消費（サーバー）が同じ分け方になるよう、両方ここを使う。
// 2026-11-03 に直したこと（最初のCSVの取り込みでタイトルが入らず、レシピが割れた原因）：
// - 表（CSV・TSV・Excel）は、どの塊の先頭にも「【表の見出し】」の行を付ける（2つめ以降の塊でも、どの列がレシピ名か分かるように）
// - 塊の切れ目は、できるだけレシピの切れ目（レシピ名の列が変わる行・空の行）にする
// - 欄の中の改行（作り方の文など）では切らない（引用符 "…" の中の改行は「 / 」にして1行にする）
// - それでもレシピの途中で切るときは、次の塊の先頭に CONTINUED を付ける。AIはそのレシピの name を CONTINUED_NAME にし、
//   buildPreview（ai/importRecipes.ts）が前のレシピにつなぐ

export const CONTINUED = "【前の続き】";
export const CONTINUED_NAME = "（続き）";
const HEADER = "【表の見出し】";
/** レシピ名の列だと思う見出し（強い順） */
const TITLE_HEADS = [/^(レシピ名|商品名|メニュー名|料理名|菓子名|タイトル|title|recipe ?name)$/i, /^(名前|名称|品名|name|recipe)$/i, /(レシピ|タイトル|商品|メニュー)/];

/** CSV・TSV を、引用符と欄の中の改行を正しく扱って行（欄の配列）にする */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** 区切り文字（タブかカンマ）。表らしくなければ null */
function delimiterOf(text: string): string | null {
  const lines = text.split("\n").filter((l) => l.trim()).slice(0, 30);
  if (lines.length < 2) return null;
  for (const d of ["\t", ","]) {
    const rows = parseDelimited(lines.join("\n"), d);
    const multi = rows.filter((r) => r.length >= 2).length;
    if (multi / rows.length >= 0.6) return d;
  }
  return null;
}

const clean = (s: string) => s.replace(/\s*\n\s*/g, " / ").replace(/[ \t　]+/g, " ").trim();

/** 見出しからレシピ名の列を探す（見つからなければ -1） */
export function titleColumn(header: string[]): number {
  const h = header.map((x) => clean(x));
  for (const re of TITLE_HEADS) {
    const i = h.findIndex((x) => re.test(x));
    if (i >= 0) return i;
  }
  return -1;
}

interface Block { lines: string[]; size: number }

/** 表を「レシピごとの行のまとまり」にする */
function tableBlocks(rows: string[][]): { header: string; blocks: Block[] } {
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  const head = nonEmpty[0] ?? [];
  const col = titleColumn(head);
  const blocks: Block[] = [];
  let cur: string[] = [];
  let lastTitle = "";
  const flush = () => { if (cur.length) blocks.push({ lines: cur, size: cur.reduce((t, l) => t + l.length + 1, 0) }); cur = []; };
  // 見出しより後ろを見る。空の行・レシピ名の列が変わる行がレシピの切れ目
  for (const r of rows.slice(rows.indexOf(head) + 1)) {
    if (!r.some((c) => c.trim())) { flush(); lastTitle = ""; continue; }
    const title = col >= 0 ? clean(r[col] ?? "") : "";
    if (col >= 0 && title && title !== lastTitle) { flush(); lastTitle = title; }
    cur.push(r.map(clean).join("\t").replace(/\t+$/, ""));
  }
  flush();
  return { header: head.map(clean).join("\t").replace(/\t+$/, ""), blocks };
}

/** 文（表でないもの）を、空の行で区切った段落にする */
function textBlocks(text: string): Block[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const lines = p.split("\n");
    return { lines, size: p.length + 2 };
  });
}

/** まとまりを size 字以下の塊に詰める。1つのまとまりが大きすぎれば行で分け、続きの塊の先頭に CONTINUED を付ける */
function pack(blocks: Block[], prefix: string, size: number, joiner: string): string[] {
  const out: string[] = [];
  const room = Math.max(200, size - prefix.length);
  let cur = "";
  const push = () => { if (cur) out.push(prefix + cur); cur = ""; };
  for (const b of blocks) {
    const body = b.lines.join("\n");
    if (body.length <= room) {
      if (cur && cur.length + joiner.length + body.length > room) push();
      cur = cur ? cur + joiner + body : body;
      continue;
    }
    // 大きすぎるまとまり：行ごとに詰め、2つめ以降は「前の続き」
    push();
    let first = true;
    for (const line0 of b.lines) {
      for (let i = 0; i < Math.max(1, line0.length); i += room - CONTINUED.length - 1) {
        const line = line0.slice(i, i + room - CONTINUED.length - 1);
        if (cur && cur.length + 1 + line.length > room) { push(); first = false; }
        if (!cur && !first) cur = CONTINUED;
        cur = cur ? `${cur}\n${line}` : line;
      }
    }
    push();
  }
  push();
  return out;
}

export function splitImportText(text: string, size: number): string[] {
  const all = text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim();
  if (!all) return [];
  // Excel は「### シート名」ごと。CSV・テキストは全体で1つ
  const sections = /^### /m.test(all) ? all.split(/\n(?=### )/) : [all];
  const out: string[] = [];
  for (const sec of sections) {
    const m = /^### (.+)\n/.exec(sec);
    const sheet = m ? m[1].trim() : "";
    let body = m ? sec.slice(m[0].length) : sec;
    // 表の前の「【何個分】18個分」などの行は、どの塊にも付ける（表の見出しと間違えない）
    const notes: string[] = [];
    while (/^【[^】]+】[^\n]*\n/.test(body)) {
      const nl = body.indexOf("\n");
      notes.push(body.slice(0, nl));
      body = body.slice(nl + 1);
    }
    const head = `${sheet ? `### ${sheet}\n` : ""}${notes.map((n) => `${n}\n`).join("")}`;
    const d = delimiterOf(body);
    if (d) {
      const { header, blocks } = tableBlocks(parseDelimited(body, d));
      out.push(...pack(blocks, `${head}${HEADER}${header}\n`, size, "\n"));
    } else {
      const cleaned = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
      out.push(...pack(textBlocks(cleaned), head, size, "\n\n"));
    }
  }
  return mergeSmall(out, size);
}

/**
 * 小さい塊（Excel の1シート＝1レシピなど）を size 字までまとめる（1シートごとに1クレジット使わないように）。
 * どの塊も「### シート名」から始まるので、まとめてもAIはシートの区切りが分かる。「前の続き」の塊は必ず新しい塊の先頭にする
 */
function mergeSmall(pieces: string[], size: number): string[] {
  const out: string[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last !== undefined && !p.includes(CONTINUED) && last.length + 2 + p.length <= size) out[out.length - 1] = `${last}\n\n${p}`;
    else out.push(p);
  }
  return out;
}
