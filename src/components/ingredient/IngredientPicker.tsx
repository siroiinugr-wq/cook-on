// 結び先の材料を「打って探して選ぶ」欄。以前は明細の行ごとに全部の材料（約230件）の選択肢を持っていて、
// 288行の明細では画面がとても重くなった（2026-11-03）。選択肢は開いている1行の分だけ作る
import { useMemo, useState } from "react";
import { buildIndex, rankCandidates } from "@shared/matchKey";
import type { Ingredient } from "@shared/types";

export interface PickerExtra { value: string; label: string }

export function IngredientPicker({ value, list, onPick, extras, labelOf, hintOf, className = "" }: {
  value: string; list: Ingredient[]; onPick: (id: string) => void;
  /** 「結ばない」「新しく登録」などの先頭の選択肢 */
  extras: PickerExtra[];
  /** 選んだ材料の表示（「（AI 80%）」などを足す） */
  labelOf?: (i: Ingredient) => string;
  /** 打つ前に出す候補の手がかり（明細の一般名・品名） */
  hintOf?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = list.find((i) => i.id === value);
  const extra = extras.find((x) => x.value === value);
  const label = cur ? (labelOf ? labelOf(cur) : cur.name) : extra?.label ?? "結ばない";

  if (!open) {
    return (
      <button type="button" onClick={() => { setQ(""); setOpen(true); }}
        className={`min-w-0 truncate rounded-lg border border-line-strong bg-paper px-2 py-1 text-left text-sm ${value ? "" : "text-muted"} ${className}`}>
        {label} <span className="text-faint">▾</span>
      </button>
    );
  }
  return <Open list={list} q={q} setQ={setQ} hint={hintOf} extras={extras} value={value} className={className}
    onPick={(id) => { onPick(id); setOpen(false); }} onClose={() => setOpen(false)} />;
}

function Open({ list, q, setQ, hint, extras, value, onPick, onClose, className }: {
  list: Ingredient[]; q: string; setQ: (s: string) => void; hint?: string; extras: PickerExtra[]; value: string;
  onPick: (id: string) => void; onClose: () => void; className: string;
}) {
  const index = useMemo(() => buildIndex(list.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] }))), [list]);
  const byId = useMemo(() => new Map(list.map((i) => [i.id, i])), [list]);
  const shown = useMemo(() => {
    const t = q.trim();
    if (!t) return hint ? rankCandidates(hint, index, 6).map((c) => byId.get(c.id)).filter((x): x is Ingredient => !!x) : [];
    const hits = list.filter((i) => [i.name, ...(i.aliases ?? [])].some((n) => n.includes(t)));
    const near = rankCandidates(t, index, 8).map((c) => byId.get(c.id)).filter((x): x is Ingredient => !!x && !hits.includes(x));
    return [...hits, ...near].slice(0, 12);
  }, [q, hint, index, byId, list]);
  return (
    <div className={`min-w-0 space-y-1 rounded-lg border border-clay bg-paper p-1.5 ${className}`}>
      <div className="flex gap-1">
        <input autoFocus className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm" placeholder="材料の名前で探す" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="px-2 text-xs text-muted underline" onClick={onClose}>閉じる</button>
      </div>
      <ul className="max-h-60 overflow-y-auto text-sm">
        {extras.map((x) => (
          <li key={x.value}><button type="button" onClick={() => onPick(x.value)} className={`w-full rounded px-2 py-1.5 text-left ${x.value === value ? "bg-clay-soft font-bold" : "hover:bg-sand"}`}>{x.label}</button></li>
        ))}
        {!q.trim() && shown.length > 0 && <li className="px-2 pt-1 text-[11px] text-faint">近い名前の材料</li>}
        {shown.map((i) => (
          <li key={i.id}><button type="button" onClick={() => onPick(i.id)} className={`w-full rounded px-2 py-1.5 text-left ${i.id === value ? "bg-clay-soft font-bold" : "hover:bg-sand"}`}>{i.name}</button></li>
        ))}
        {q.trim() && !shown.length && <li className="px-2 py-1.5 text-xs text-muted">見つかりません。「新しい材料として登録」を選べます。</li>}
      </ul>
    </div>
  );
}
