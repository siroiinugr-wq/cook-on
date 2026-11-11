// 印刷のコツと、ずれたときの直し方。プリンターや端末で少しずつ違うので、テスト印刷で確かめて、この端末にずれを覚える
import { useState } from "react";
import type { LabelPaper } from "@shared/label";
import type { PrintAdjust } from "./LabelSheet";

const STEP = 0.5;

export function PrintHelp({ paper, adjust, onAdjust, onTest }: { paper: LabelPaper; adjust: PrintAdjust; onAdjust: (a: PrintAdjust) => void; onTest: () => void }) {
  const moved = adjust.dx !== 0 || adjust.dy !== 0;
  const [open, setOpen] = useState(false);
  const btn = "h-8 w-8 rounded-lg border border-line-strong bg-paper text-base";
  const row = (label: string, key: "dx" | "dy", minus: string, plus: string) => (
    <div className="flex items-center gap-2">
      <span className="w-10">{label}</span>
      <button className={btn} aria-label={minus} onClick={() => onAdjust({ ...adjust, [key]: adjust[key] - STEP })}>−</button>
      <span className="w-16 text-center tabular-nums">{adjust[key] > 0 ? "+" : ""}{adjust[key].toFixed(1)}mm</span>
      <button className={btn} aria-label={plus} onClick={() => onAdjust({ ...adjust, [key]: adjust[key] + STEP })}>＋</button>
      <span className="text-xs text-muted">{minus}　／　{plus}</span>
    </div>
  );
  return (
    <div className="space-y-2 text-xs text-muted">
      <p>
        {paper.sheet
          ? "印刷の画面で、用紙は「A4」、倍率は「100%」（「用紙に合わせる」はオフ）、余白は「なし」を選んでください。"
          : `印刷の画面で、用紙はプリンターに入れたラベル（幅${paper.w}mm）を選び、倍率は「100%」にしてください。`}
        PDFに保存もできます。
      </p>
      <button className="text-clay-strong underline" onClick={() => setOpen(!open)}>
        {open ? "とじる" : `はじめての用紙・ずれるときは：テスト印刷と位置の調整${moved ? "（調整あり）" : ""}`}
      </button>
      {open && (
        <div className="space-y-2 rounded-xl bg-sand p-3 text-sm text-ink-soft">
          <p>まずテスト印刷を1枚。枠が用紙のふちから同じ幅（1.5mm）で、「この線が10mm」が定規で10mmなら、そのまま使えます。</p>
          <button className="rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-sm" onClick={onTest}>テスト印刷（枠だけ）</button>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            <li>線が10mmでない：印刷の画面の倍率が100%になっていません（「用紙に合わせる」をオフに）。</li>
            <li>枠が片方に寄っている：下のボタンで、寄せたい向きへ動かします。この端末に覚えます。</li>
            {!paper.sheet && <li>ラベルプリンターで枠の端が欠ける：プリンターが刷れない幅（左右 約1.5〜3mm）にかかっています。用紙の「自由な大きさ」で幅を2〜4mm小さくしてください。</li>}
            {!paper.sheet && <li>iPad・iPhone で大きさが合わない：画像で書き出す「PNG」を保存し、プリンターのアプリ（ブラザーなら Brother iPrint&amp;Label）から刷ると確実です。</li>}
          </ul>
          {row("横", "dx", "左へ", "右へ")}
          {row("縦", "dy", "上へ", "下へ")}
          {moved && <button className="text-xs underline" onClick={() => onAdjust({ dx: 0, dy: 0 })}>調整をなくす（0に戻す）</button>}
        </div>
      )}
    </div>
  );
}
