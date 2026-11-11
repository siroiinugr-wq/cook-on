// ラベル1枚を画像（PNG）と SVG に書き出す。Illustrator・Word に貼って刷る人のため（2026-11-05 MASA の希望）。
// 画面のラベル（components/label/LabelSheet.tsx）と同じ並び・字の大きさを、mm の単位で組み立て直して描く。
// PNG は 600dpi で、用紙の大きさ（mm）を画像の中に書いておく（pHYs）。Word・Illustrator に貼るとその大きさで入る
import type { LabelData } from "./labelBuild";

/** ラベルの字。端末に入っている字を先に使う（ネットから読む字より印刷・書き出しが速い） */
export const LABEL_FONT = `"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","YuGothic",Meiryo,"Noto Sans JP",sans-serif`;

const PT = 0.3528; // 1pt = 0.3528mm
export const LABEL_DPI = 600;

/**
 * 字の大きさの下限（食品表示基準）：8pt 以上。表示できる面がおおむね150cm²以下なら 5.5pt 以上。
 * ラベル1枚の面積で見る（A4 12面の1面は約36cm²なので 5.5pt）
 */
export function minLabelPt(w: number, h: number): number {
  return w * h <= 15000 ? 5.5 : 8;
}

/** はじめの字の大きさ：小さい用紙ほど小さく（62×40 で 6pt 前後）。入りきらなければ fitLabel が下限まで縮める */
export function labelPt(w: number, h: number): number {
  return Math.max(minLabelPt(w, h), Math.min(8, Math.min(w, h * 1.6) / 10.5));
}

export function labelRows(d: LabelData): [string, string][] {
  return [
    ["名称", d.productName],
    ["原材料名", d.ingredientsText],
    ["内容量", d.contentText],
    ...(d.nutritionText ? [["栄養成分表示", d.nutritionText] as [string, string]] : []),
    [d.expiryKind, d.expiry],
    ["保存方法", d.storage],
    ["製造者", [d.manufacturer, d.manufacturerAddress].filter((x) => x?.trim()).join("　")],
  ];
}

interface Text { x: number; y: number; s: string; size: number }
interface Layout { w: number; h: number; lines: [number, number, number, number][]; texts: Text[]; fits: boolean; /** 全部が入る高さ(mm) */ needH: number }

/** 1文字ずつ折り返す（ラベルの欄と同じ「どこでも折る」） */
function wrap(s: string, max: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let cur = "";
    for (const ch of Array.from(para)) {
      if (cur && measure(cur + ch) > max) { out.push(cur); cur = ch; } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

/** 線と字の置き場所を mm で決める。measure は「この字の大きさ(mm)で何mmの幅か」 */
function layout(d: LabelData, w: number, h: number, pt: number, measure: (s: string, size: number) => number): Layout {
  const size = pt * PT;
  const lh = size * 1.25;
  const pad = 1.5, cellX = 0.8, cellY = 0.4;
  const foot = d.dateOutside ? Math.max(3.2, pt * 0.55) : 0;
  const rows = labelRows(d);
  const tw = w - pad * 2;
  const th = h - pad * 2 - foot;
  const keyW = Math.max(...rows.map(([k]) => measure(k, size))) + cellX * 2;
  const wrapped = rows.map(([, v]) => wrap(v ?? "", tw - keyW - cellX * 2, (s) => measure(s, size)));
  const need = wrapped.map((ls) => Math.max(1, ls.length) * lh + cellY * 2);
  // 枠いっぱいまで行を伸ばす（画面の表と同じ）。足りないときは下が切れる
  const total = need.reduce((a, b) => a + b, 0);
  const extra = Math.max(0, th - total) / rows.length;
  const out: Layout = { w, h, lines: [], texts: [], fits: total <= th + 0.05, needH: Math.ceil((total + pad * 2 + foot) * 10) / 10 };
  let y = pad;
  rows.forEach(([k], i) => {
    const rh = need[i] + extra;
    const base = y + cellY + size * 0.88 + (lh - size) / 2;
    out.texts.push({ x: pad + cellX, y: base, s: k, size });
    wrapped[i].forEach((s, j) => out.texts.push({ x: pad + keyW + cellX, y: base + j * lh, s, size }));
    y += rh;
    if (i < rows.length - 1) out.lines.push([pad, y, pad + tw, y]);
  });
  const bottom = Math.min(y, pad + th);
  out.lines.push([pad, pad, pad + tw, pad], [pad, bottom, pad + tw, bottom], [pad, pad, pad, bottom], [pad + tw, pad, pad + tw, bottom], [pad + keyW, pad, pad + keyW, bottom]);
  if (d.dateOutside && d.outsideDate) {
    const fs = (pt + 0.5) * PT;
    out.texts.push({ x: pad, y: pad + th + 0.5 + fs * 0.88, s: d.outsideDate, size: fs });
  }
  // 枠からはみ出した字は描かない（画面のラベルと同じく下が切れる）
  out.texts = out.texts.filter((t) => t.y <= h - pad + 0.2);
  return out;
}

let ctx: CanvasRenderingContext2D | null = null;
function measurer(): (s: string, size: number) => number {
  ctx ??= document.createElement("canvas").getContext("2d")!;
  return (s, size) => {
    if (!ctx) return s.length * size;
    ctx.font = `${size * 10}px ${LABEL_FONT}`;
    return ctx.measureText(s).width / 10;
  };
}

export interface LabelFit {
  /** 使う字の大きさ(pt) */
  pt: number;
  /** この用紙に全部入るか */
  fits: boolean;
  /** 下限の字で全部入る高さ(mm)。入らないとき「下に伸ばして保存」に使う */
  needH: number;
  /** 下限の字の大きさ */
  minPt: number;
}

/** 入りきるまで字を縮める（0.25pt ずつ、下限まで）。それでも入らなければ fits=false */
export function fitLabel(d: LabelData, w: number, h: number): LabelFit {
  const m = measurer();
  const minPt = minLabelPt(w, h);
  let pt = labelPt(w, h);
  for (;;) {
    const L = layout(d, w, h, pt, m);
    if (L.fits) return { pt, fits: true, needH: L.needH, minPt };
    if (pt <= minPt) return { pt: minPt, fits: false, needH: L.needH, minPt };
    pt = Math.max(minPt, Math.round((pt - 0.25) * 100) / 100);
  }
}

/** 入りきらないとき、ほかの用紙で入るもの（字の下限で） */
export function papersThatFit<P extends { w: number; h: number }>(d: LabelData, papers: readonly P[]): P[] {
  return papers.filter((p) => fitLabel(d, p.w, p.h).fits);
}

/** 書き出す前に字を用意しておく（無い端末ではほかの字になる） */
async function fontsReady(): Promise<void> {
  try { await document.fonts?.ready; } catch { /* 字が読めなくても描ける */ }
}

/** 600dpi の PNG（用紙の大きさつき） */
/** 入りきらないラベルの書き出し方：stretch＝下に伸ばして全部入れる（字は下限のまま）、cut＝用紙の大きさで下が切れる */
export type Overflow = "stretch" | "cut";

function layoutFor(d: LabelData, w: number, h: number, overflow: Overflow): Layout {
  const fit = fitLabel(d, w, h);
  return layout(d, w, !fit.fits && overflow === "stretch" ? fit.needH : h, fit.pt, measurer());
}

export async function labelPng(d: LabelData, w: number, h: number, overflow: Overflow = "cut"): Promise<Blob> {
  await fontsReady();
  const L = layoutFor(d, w, h, overflow);
  h = L.h;
  const k = LABEL_DPI / 25.4;
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 0.2 * k;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of L.lines) { ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); }
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  for (const t of L.texts) {
    ctx.font = `${t.size * k}px ${LABEL_FONT}`;
    ctx.fillText(t.s, t.x * k, t.y * k);
  }
  const blob = await new Promise<Blob>((ok, ng) => c.toBlob((b) => (b ? ok(b) : ng(new Error("画像を作れませんでした"))), "image/png"));
  return withDpi(blob, LABEL_DPI);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Math.round(v * 1000) / 1000;

/** SVG（Illustrator で開くと字を直せる。大きさは mm） */
export async function labelSvg(d: LabelData, w: number, h: number, overflow: Overflow = "cut"): Promise<Blob> {
  await fontsReady();
  const L = layoutFor(d, w, h, overflow);
  h = L.h;
  const lines = L.lines.map(([x1, y1, x2, y2]) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`).join("");
  const texts = L.texts.map((t) => `<text x="${n(t.x)}" y="${n(t.y)}" font-size="${n(t.size)}">${esc(t.s)}</text>`).join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#fff"/>
<g stroke="#000" stroke-width="0.2">${lines}</g>
<g fill="#000" font-family='${LABEL_FONT}' xml:space="preserve">${texts}</g>
</svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

// --- PNG に解像度（pHYs）を書き込む。これが無いと Word は 96dpi とみなして6倍の大きさで貼る ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export async function withDpi(png: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await png.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  chunk[16] = 1; // メートルあたり
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; // 署名8＋IHDR 25 のあと
  const out = new Uint8Array(src.length + 21);
  out.set(src.subarray(0, at));
  out.set(chunk, at);
  out.set(src.subarray(at), at + 21);
  return new Blob([out], { type: "image/png" });
}

/** 端末に保存（iPad・iPhone は共有の画面から「画像を保存」・「ファイルに保存」） */
export async function saveBlob(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 画像をコピー（Word・Illustrator にそのまま貼る）。できない端末は false */
export async function copyPng(make: () => Promise<Blob>): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  // Safari はクリックのすぐあとに write を呼ぶ必要があるので、画像は Promise のまま渡す
  await navigator.clipboard.write([new ClipboardItem({ "image/png": make() })]);
  return true;
}
