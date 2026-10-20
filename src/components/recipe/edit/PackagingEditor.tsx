// レシピの包装（1個あたり）。包装セットか資材を選び、1個にいくつ使うかを入れる
import { Link } from "react-router-dom";
import { yen } from "@shared/cost";
import { calcPackaging, PACK_LIMITS, type PackCtx } from "@shared/packaging";
import type { PackagingMaterial, PackagingSet, RecipePackLine } from "@shared/types";
import { Icon } from "../../common/Icon";
import { ui } from "../../common/ui";

interface Props {
  lines: RecipePackLine[];
  set: (lines: RecipePackLine[]) => void;
  materials: PackagingMaterial[];
  sets: PackagingSet[];
  ctx: PackCtx;
}

export function PackagingEditor({ lines, set, materials, sets, ctx }: Props) {
  const c = calcPackaging(lines, ctx);
  const patch = (i: number, p: Partial<RecipePackLine>) => set(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  // 選択肢の値は「set:id」「item:id」。セットを先に並べる（いつもの組み合わせを選ぶ方が早い）
  const add = (v: string) => {
    const [kind, id] = v.split(":") as ["set" | "item", string];
    const name = kind === "set" ? ctx.setById.get(id)?.name : ctx.matById.get(id)?.name;
    if (name) set([...lines, { kind, refId: id, name, qty: 1 }]);
  };

  if (!materials.length && !sets.length && !lines.length) {
    return (
      <Link to="/packaging" className={`${ui.card} flex items-center gap-3 text-sm`}>
        <span className="text-clay"><Icon name="box" /></span>
        <span className="flex-1 text-muted">袋や脱酸素剤の値段を登録すると、1個あたりの包装代を原価に入れられます。</span>
        <Icon name="chevron" className="h-4 w-4 text-faint" />
      </Link>
    );
  }
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const known = l.refId && (l.kind === "set" ? ctx.setById.has(l.refId) : ctx.matById.has(l.refId));
        const cost = c.lines[i];
        return (
          <div key={`${l.kind}:${l.refId}:${i}`} className="flex items-center gap-1.5 rounded-xl border border-line bg-paper p-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.kind === "set" ? "📦 " : ""}{l.name}</span>
              {!known && <span className="block text-xs text-warn-strong">包装資材の一覧に無い（消された？）</span>}
              {known && cost.missing > 0 && <span className="block text-xs text-warn-strong">値段の無い資材が{cost.missing}つ</span>}
            </span>
            <input className="w-14 rounded-lg border border-line-strong px-2 py-1 text-right" inputMode="decimal" aria-label="1個に使う数" value={l.qty}
              onChange={(e) => patch(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
            <span className="w-16 text-right text-xs">{cost.cost === null ? "—" : yen(cost.cost)}</span>
            <button className="px-1 text-faint" aria-label="この包装を外す" onClick={() => set(lines.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></button>
          </div>
        );
      })}
      {lines.length < PACK_LIMITS.lines && (
        <select className={ui.input} value="" onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">＋ 包装を足す</option>
          {sets.length > 0 && <optgroup label="セット">{sets.map((s) => <option key={s.id} value={`set:${s.id}`}>{s.name}</option>)}</optgroup>}
          {materials.length > 0 && <optgroup label="資材">{materials.map((m) => <option key={m.id} value={`item:${m.id}`}>{m.name}</option>)}</optgroup>}
        </select>
      )}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>1個あたりの包装 <b className="text-sm text-ink">{yen(c.perPiece)}</b></span>
        <Link to="/packaging" className="underline">資材・セットを直す</Link>
      </div>
    </div>
  );
}
