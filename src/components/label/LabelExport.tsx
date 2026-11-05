// ラベルを画像で書き出す（Illustrator・Word に貼って刷る人のため）。PNG は用紙の大きさつきの 600dpi、SVG は字を直せる
import { useState } from "react";
import type { LabelData } from "../../lib/labelBuild";
import { copyPng, labelPng, labelSvg, saveBlob } from "../../lib/labelImage";
import { Icon } from "../common/Icon";

const fileName = (s: string) => (s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "label") + "_ラベル";

export function LabelExport({ d, w, h, name, compact = false, disabled = false }: {
  d: LabelData; w: number; h: number;
  /** ファイルの名前（商品名） */
  name: string;
  /** 一覧の行に置く小さい形 */
  compact?: boolean;
  disabled?: boolean;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(f: () => Promise<string | void>) {
    setBusy(true);
    setMsg("");
    try { setMsg((await f()) || ""); } catch (e) { setMsg(e instanceof Error ? e.message : "書き出せませんでした"); } finally { setBusy(false); }
  }
  const png = () => run(async () => saveBlob(await labelPng(d, w, h), `${fileName(name)}.png`));
  const svg = () => run(async () => saveBlob(await labelSvg(d, w, h), `${fileName(name)}.svg`));
  const copy = () => run(async () => ((await copyPng(() => labelPng(d, w, h))) ? "画像をコピーしました。Word や Illustrator に貼り付けられます。" : "この端末ではコピーできません。PNG で保存してください。"));
  const btn = `inline-flex items-center gap-1 rounded-lg border border-line-strong bg-paper ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} text-ink-soft disabled:opacity-50`;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && <span className="text-xs text-muted">画像で書き出す</span>}
        <button className={btn} disabled={busy || disabled} onClick={png}><Icon name="download" className="h-3.5 w-3.5" />PNG</button>
        <button className={btn} disabled={busy || disabled} onClick={svg}><Icon name="download" className="h-3.5 w-3.5" />SVG</button>
        <button className={btn} disabled={busy || disabled} onClick={copy}><Icon name="file" className="h-3.5 w-3.5" />コピー</button>
      </div>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
      {!compact && <p className="text-xs text-muted">PNG は {w}×{h}mm の大きさ（600dpi）で Word・Illustrator に入ります。SVG は Illustrator で開くと字を直せます。</p>}
    </div>
  );
}
