// ラベルを画像で書き出す（Illustrator・Word に貼って刷る人のため）。PNG は用紙の大きさつきの 600dpi、SVG は字を直せる。
// 用紙に入りきらないときは、押したあとに「下に伸ばして保存／切れたまま保存／やめる」を聞く（2026-11-05 MASA の希望）
import { useMemo, useState } from "react";
import type { LabelData } from "../../lib/labelBuild";
import { copyPng, fitLabel, labelPng, labelSvg, saveBlob, type Overflow } from "../../lib/labelImage";
import { Icon } from "../common/Icon";

const fileName = (s: string) => (s.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "label") + "_ラベル";
type Kind = "png" | "svg" | "copy";

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
  const [ask, setAsk] = useState<Kind | null>(null);
  const fit = useMemo(() => fitLabel(d, w, h), [d, w, h]);
  async function run(kind: Kind, o: Overflow) {
    setAsk(null);
    setBusy(true);
    setMsg("");
    try {
      if (kind === "png") await saveBlob(await labelPng(d, w, h, o), `${fileName(name)}.png`);
      else if (kind === "svg") await saveBlob(await labelSvg(d, w, h, o), `${fileName(name)}.svg`);
      else setMsg((await copyPng(() => labelPng(d, w, h, o))) ? "画像をコピーしました。Word や Illustrator に貼り付けられます。" : "この端末ではコピーできません。PNG で保存してください。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "書き出せませんでした");
    } finally {
      setBusy(false);
    }
  }
  const press = (kind: Kind) => (fit.fits ? run(kind, "cut") : setAsk(kind));
  const btn = `inline-flex items-center gap-1 rounded-lg border border-line-strong bg-paper ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} text-ink-soft disabled:opacity-50`;
  const tall = Math.ceil(fit.needH);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && <span className="text-xs text-muted">画像で書き出す</span>}
        <button className={btn} disabled={busy || disabled} onClick={() => press("png")}><Icon name="download" className="h-3.5 w-3.5" />PNG</button>
        <button className={btn} disabled={busy || disabled} onClick={() => press("svg")}><Icon name="download" className="h-3.5 w-3.5" />SVG</button>
        <button className={btn} disabled={busy || disabled} onClick={() => press("copy")}><Icon name="file" className="h-3.5 w-3.5" />コピー</button>
        {compact && !fit.fits && <span className="text-xs text-ng">入りきりません（約{Math.ceil(fit.needH - h)}mm）</span>}
      </div>
      {ask && (
        <div className="space-y-2 rounded-xl border border-ng/40 bg-ng/5 p-3 text-sm">
          <p>このラベルは {w}×{h}mm に入りきりません（字は下限の{fit.minPt}pt）。どうしますか？</p>
          <div className="flex flex-wrap gap-1.5">
            <button className="rounded-lg bg-clay px-3 py-1.5 font-bold text-white" onClick={() => run(ask, "stretch")}>下に伸ばして{ask === "copy" ? "コピー" : "保存"}（{w}×{tall}mm）</button>
            <button className="rounded-lg border border-line-strong bg-paper px-3 py-1.5" onClick={() => run(ask, "cut")}>切れたまま{ask === "copy" ? "コピー" : "保存"}</button>
            <button className="rounded-lg px-3 py-1.5 text-muted underline" onClick={() => setAsk(null)}>やめる</button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
      {!compact && <p className="text-xs text-muted">PNG は {w}×{h}mm の大きさ（600dpi）で Word・Illustrator に入ります。SVG は Illustrator で開くと字を直せます。</p>}
    </div>
  );
}
