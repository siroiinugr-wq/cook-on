// ラベル1枚の見た目。画面のプレビューと印刷で同じ部品を使う（大きさは mm で指定）
import type { LabelInfo } from "@shared/label";

export interface LabelData extends LabelInfo {
  ingredientsText: string;
  contentText: string;
  expiry: string;
}

export function LabelSheet({ d, w, h }: { d: LabelData; w: number; h: number }) {
  // 小さい用紙ほど字を小さく（62×40 で 6pt 前後）。読める下限は 5.5pt
  const pt = Math.max(5.5, Math.min(8, Math.min(w, h * 1.6) / 10.5));
  const rows: [string, string][] = [
    ["名称", d.productName],
    ["原材料名", d.ingredientsText],
    ["内容量", d.contentText],
    [d.expiryKind, d.expiry],
    ["保存方法", d.storage],
    ["製造者", d.manufacturer],
  ];
  return (
    <div className="label-sheet overflow-hidden bg-white text-black" style={{ width: `${w}mm`, height: `${h}mm`, padding: "1.5mm", fontSize: `${pt}pt`, lineHeight: 1.25 }}>
      <table className="h-full w-full border-collapse" style={{ border: "0.2mm solid #000" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th className="whitespace-nowrap text-left align-top font-normal" style={{ border: "0.2mm solid #000", padding: "0.4mm 0.8mm", width: "1%" }}>{k}</th>
              <td className="align-top" style={{ border: "0.2mm solid #000", padding: "0.4mm 0.8mm", wordBreak: "break-all" }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 印刷するときだけ使う用紙の設定。A4 の面付けは 2列×6段 */
export function printCss(paper: { id: string; w: number; h: number }): string {
  if (paper.id === "a4-12") {
    return `@page { size: A4; margin: 21.5mm 18.6mm; }
.print-only .label-grid { display: grid !important; grid-template-columns: repeat(2, ${paper.w}mm); grid-auto-rows: ${paper.h}mm; }
.print-only .label-grid > div { break-inside: avoid; }`;
  }
  return `@page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
.print-only .label-grid > div { break-after: page; }`;
}
