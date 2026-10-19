// 倍率：ロット数（×2.5）か、欲しい個数（30個）で決める。分量・原価・作業モードがこの倍率で変わる
import { scaleFactor, type ScaleMode } from "@shared/cost";
import { formatQty } from "@shared/units";
import { Icon } from "../common/Icon";

const LOTS = [0.5, 1, 2, 2.5, 3];

export function ScaleControl({ mode, set, pieces }: { mode: ScaleMode; set: (m: ScaleMode) => void; pieces: number }) {
  const factor = scaleFactor(mode, pieces);
  const tab = (on: boolean) => `flex-1 rounded-lg py-1.5 text-sm ${on ? "bg-paper font-bold shadow-sm" : "text-muted"}`;
  return (
    <div className="space-y-2 rounded-2xl bg-sand p-3">
      <div className="flex items-center gap-2">
        <span className="text-clay"><Icon name="scale" className="h-5 w-5" /></span>
        <div className="flex flex-1 gap-1 rounded-xl bg-line/60 p-1">
          <button className={tab(mode.kind === "lot")} onClick={() => set({ kind: "lot", lots: 1 })}>ロット数で</button>
          <button className={tab(mode.kind === "pieces")} onClick={() => set({ kind: "pieces", pieces: pieces })}>個数で</button>
        </div>
      </div>
      {mode.kind === "lot" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {LOTS.map((l) => (
            <button key={l} onClick={() => set({ kind: "lot", lots: l })}
              className={`rounded-full px-3 py-1 text-sm ${mode.lots === l ? "bg-clay font-bold text-white" : "bg-paper text-ink-soft"}`}>×{l}</button>
          ))}
          <label className="flex items-center gap-1 text-sm">×
            <input type="number" min={0.1} step={0.1} value={mode.lots} onChange={(e) => set({ kind: "lot", lots: Number(e.target.value) || 1 })}
              className="w-16 rounded-lg border border-line-strong bg-paper px-2 py-1" />
          </label>
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="number" min={1} value={mode.pieces} onChange={(e) => set({ kind: "pieces", pieces: Number(e.target.value) || pieces })}
            className="w-20 rounded-lg border border-line-strong bg-paper px-2 py-1" />
          個 作りたい
        </label>
      )}
      <p className="text-xs text-muted">いまの分量：1ロット（{pieces}個）の ×{formatQty(Math.round(factor * 1000) / 1000)} ＝ {formatQty(Math.round(pieces * factor * 10) / 10)}個分</p>
    </div>
  );
}
