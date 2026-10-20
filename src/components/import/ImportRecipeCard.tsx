// 取り込みプレビューのレシピ1件。材料ごとに「どの材料として保存するか」を色で見せ、選び直せる
//   緑＝一致（そのまま）／黄＝たぶん（確かめて）／灰＝新しい材料として作る
import { matchLevel, type ItemMatch, type ParsedRecipe } from "@shared/importTypes";
import { formatQty } from "@shared/units";

const NEW = "__new__";
const LEVEL = {
  ok: "border-ok/40 bg-ok-soft",
  check: "border-warn/50 bg-warn-soft",
  new: "border-line bg-sand",
} as const;

export function ImportRecipeCard({ r, set, readOnly }: { r: ParsedRecipe; set: (r: ParsedRecipe) => void; readOnly: boolean }) {
  const choose = (i: number, value: string) => {
    const it = r.items[i];
    const cands = it.match.candidates ?? [];
    const pickd = value === NEW ? null : value === it.match.id ? { id: it.match.id, name: it.match.name } : cands.find((c) => c.id === value);
    const match: ItemMatch = pickd
      ? { ...it.match, kind: value === it.match.id ? it.match.kind : "global", id: pickd.id, name: pickd.name, confidence: 1, via: "user" }
      : { ...it.match, kind: "none", id: null, name: null, confidence: 0, via: "user" };
    set({ ...r, items: r.items.map((x, j) => (j === i ? { ...x, match } : x)) });
  };

  return (
    <section className={`space-y-2 rounded-2xl border bg-paper p-3 ${r.skip ? "border-line opacity-50" : "border-line-strong"}`}>
      <div className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5 accent-clay" checked={!r.skip} disabled={readOnly} onChange={(e) => set({ ...r, skip: !e.target.checked })} aria-label="取り込む" />
        <input className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 font-bold" value={r.name} disabled={readOnly} onChange={(e) => set({ ...r, name: e.target.value })} />
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
          <input className="w-12 rounded-lg border border-line px-1 py-1 text-right" inputMode="numeric" value={r.pieces ?? ""} placeholder="1" disabled={readOnly}
            onChange={(e) => set({ ...r, pieces: Number(e.target.value.replace(/\D/g, "")) || null })} />個分
        </label>
      </div>
      {!r.skip && (
        <ul className="space-y-1">
          {r.items.map((it, i) => {
            const lv = matchLevel(it.match);
            const options = [
              ...(it.match.id ? [{ id: it.match.id, name: it.match.name ?? "" }] : []),
              ...(it.match.candidates ?? []).filter((c) => c.id !== it.match.id),
            ];
            return (
              <li key={i} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-2 py-1.5 text-sm ${LEVEL[lv]}`}>
                <span className="min-w-0 flex-1">
                  {it.raw}
                  <span className="ml-1 text-muted">{it.unit === "適量" ? "適量" : `${formatQty(it.qty)}${it.unit}`}</span>
                </span>
                <select className="max-w-[55%] rounded-lg border border-line bg-paper px-1 py-1 text-xs" disabled={readOnly} value={it.match.id ?? NEW} onChange={(e) => choose(i, e.target.value)}>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === it.match.id && it.match.kind === "tenant" ? "（お店の材料）" : ""}</option>)}
                  <option value={NEW}>「{it.std || it.raw}」を新しく作る</option>
                </select>
              </li>
            );
          })}
          {r.steps.length > 0 && <li className="px-1 text-xs text-muted">作り方 {r.steps.length}工程</li>}
        </ul>
      )}
    </section>
  );
}
