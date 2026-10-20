// 読み取る前の一覧：撮った写真を小さく並べ、押すと大きく見て「撮り直す」「消す」。並び順＝読み取る順（AI経理の CaptureTray を流用）
import { useState } from "react";
import type { TrayItem } from "../../hooks/useCaptureTray";
import type { SendState } from "../../lib/captureTray";
import { Icon } from "../common/Icon";

const BADGE: Record<SendState, { label: string; cls: string } | null> = {
  ready: null,
  sending: { label: "送信中", cls: "bg-ink/70 text-white" },
  sent: { label: "送信済み", cls: "bg-ok text-white" },
  failed: { label: "失敗", cls: "bg-ng text-white" },
};

export function CaptureTray({ items, onRemove, onRetake, busy }: {
  items: TrayItem[];
  onRemove: (id: string) => void;
  onRetake: (id: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState<TrayItem | null>(null);
  if (!items.length) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">読み取る前の確認（{items.length}枚）</h2>
        <span className="text-xs text-muted">押すと大きく見られます</span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((it, n) => {
          const badge = BADGE[it.state];
          return (
            <li key={it.id} className="relative">
              <button type="button" onClick={() => setOpen(it)} disabled={busy}
                className="block aspect-[3/4] w-full overflow-hidden rounded-xl border border-line bg-sand">
                <img src={it.url} alt={`${n + 1}枚目`} className="h-full w-full object-cover" />
              </button>
              <span className="absolute left-1.5 top-1.5 rounded-full bg-paper/90 px-1.5 text-xs font-bold text-ink-soft">{n + 1}</span>
              {it.state === "ready" && !busy && (
                <button type="button" onClick={() => onRemove(it.id)} aria-label={`${n + 1}枚目を消す`}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/60 text-white">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
              {badge && <span className={`absolute inset-x-1 bottom-1 rounded-md py-0.5 text-center text-xs font-bold ${badge.cls}`}>{badge.label}</span>}
            </li>
          );
        })}
      </ul>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-ink/90 p-4" onClick={() => setOpen(null)}>
          <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img src={open.url} alt="" className="mx-auto max-h-full rounded-xl object-contain" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { onRemove(open.id); setOpen(null); }} className="rounded-xl border border-white/40 py-3 text-white">消す</button>
            <button type="button" onClick={() => { onRetake(open.id); setOpen(null); }} className="rounded-xl bg-clay py-3 font-bold text-white">撮り直す</button>
            <button type="button" onClick={() => setOpen(null)} className="rounded-xl bg-paper py-3 font-bold text-ink">閉じる</button>
          </div>
        </div>
      )}
    </section>
  );
}
