// ラベル1枚の見た目。画面のプレビューと印刷で同じ部品を使う（大きさは mm で指定）
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { LabelPaper } from "@shared/label";
import type { LabelData } from "../../lib/labelBuild";
import { LABEL_FONT, labelPt, labelRows } from "../../lib/labelImage";

export type { LabelData };

export function LabelSheet({ d, w, h }: { d: LabelData; w: number; h: number }) {
  // 字の大きさと欄は画像の書き出し（lib/labelImage.ts）と共通
  const pt = labelPt(d, w, h);
  const rows = labelRows(d);
  // 枠外に日付を書くときは、下に日付の場所を空ける（印刷しない設定でもスタンプ用に空ける）
  const foot = d.dateOutside ? Math.max(3.2, pt * 0.55) : 0;
  return (
    <div className="label-sheet flex flex-col overflow-hidden bg-white text-black" style={{ width: `${w}mm`, height: `${h}mm`, padding: "1.5mm", fontSize: `${pt}pt`, lineHeight: 1.25, fontFamily: LABEL_FONT }}>
      <table className="w-full flex-1 border-collapse" style={{ border: "0.2mm solid #000" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th className="whitespace-nowrap text-left align-top font-normal" style={{ border: "0.2mm solid #000", padding: "0.4mm 0.8mm", width: "1%" }}>{k}</th>
              <td className="align-top" style={{ border: "0.2mm solid #000", padding: "0.4mm 0.8mm", wordBreak: "break-all" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.dateOutside && (
        <div className="whitespace-nowrap" style={{ height: `${foot}mm`, paddingTop: "0.5mm", fontSize: `${pt + 0.5}pt`, lineHeight: 1 }}>
          {d.outsideDate ?? ""}
        </div>
      )}
    </div>
  );
}

/**
 * 印刷するときだけ使う用紙の設定。A4 の面付けは sheet の cols×rows を余白から並べる。
 * ラベルプリンター（ロール）は1枚＝1ページ
 */
export function printCss(paper: LabelPaper): string {
  if (paper.sheet) {
    const s = paper.sheet;
    return `@page { size: A4; margin: ${s.top}mm ${s.left}mm; }
.print-only .label-grid { display: grid !important; grid-template-columns: repeat(${s.cols}, ${paper.w}mm); grid-auto-rows: ${paper.h}mm; }
.print-only .label-grid > div { break-inside: avoid; }`;
  }
  return `@page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
.print-only .label-grid > div { break-after: page; }`;
}

/** A4 の面付けで、何面目から貼るか（使いかけのシートの続きに刷る）。前を空けるための数 */
export function sheetSlots(paper: LabelPaper): number {
  return paper.sheet ? paper.sheet.cols * paper.sheet.rows : 0;
}

/**
 * 印刷するときだけラベルを並べる。以前は隠したまま何百枚分も毎回作り直していて、入力や印刷が重かった（2026-11-05）。
 * 印刷ボタンのほか、ブラウザのメニューから印刷したとき（beforeprint）も並べる
 */
export function usePrinting(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setOn(true));
    const after = () => setOn(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  return [on, () => { flushSync(() => setOn(true)); window.print(); }];
}

/** 印刷するラベルを並べる（A4 の面付けは start 面目から。前は空ける） */
export function PrintGrid({ labels, paper, start = 1 }: { labels: LabelData[]; paper: LabelPaper; start?: number }) {
  const blanks = paper.sheet ? Math.max(0, Math.min(sheetSlots(paper) - 1, start - 1)) : 0;
  return (
    <div className="print-only">
      <div className="label-grid">
        {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}
        {labels.map((d, i) => <div key={i}><LabelSheet d={d} w={paper.w} h={paper.h} /></div>)}
      </div>
    </div>
  );
}

/** 用紙の選び方（自由な大きさも） */
export function PaperPicker({ paperId, onChange, papers }: { paperId: string; onChange: (id: string) => void; papers: readonly LabelPaper[] }) {
  const custom = paperId.startsWith("custom:");
  const [cw, ch] = custom ? paperId.slice(7).split("x") : ["62", "50"];
  const input = "w-full rounded-lg border border-line-strong bg-paper px-2 py-1.5 text-sm";
  return (
    <div className="space-y-2">
      <select className={input} value={custom ? "custom" : paperId} onChange={(e) => onChange(e.target.value === "custom" ? `custom:${cw}x${ch}` : e.target.value)}>
        {papers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="custom">自由な大きさ（ラベルプリンターのロールなど）</option>
      </select>
      {custom && (
        <div className="flex items-center gap-2 text-sm">
          幅<input className={`${input} w-20`} inputMode="decimal" defaultValue={cw} onBlur={(e) => onChange(`custom:${Number(e.target.value) || 62}x${ch}`)} />×
          高さ<input className={`${input} w-20`} inputMode="decimal" defaultValue={ch} onBlur={(e) => onChange(`custom:${cw}x${Number(e.target.value) || 50}`)} />mm
        </div>
      )}
    </div>
  );
}
