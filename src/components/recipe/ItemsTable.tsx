// 材料の表：分量（倍率をかけた値）・g・原価。原価に入らなかった行は理由を出す
import { Link } from "react-router-dom";
import { calcCost, yen, type MissingReason } from "@shared/cost";
import type { Ingredient, RecipeItem } from "@shared/types";
import { formatQty } from "@shared/units";

export const MISSING_TEXT: Record<MissingReason, string> = {
  noIngredient: "材料の一覧に無い",
  noPrice: "仕入れ値が未入力",
  noGrams: "gに換算できない（1個の重さが未入力）",
};

export function ItemsTable({ items, byId, factor }: { items: RecipeItem[]; byId: Map<string, Ingredient>; factor: number }) {
  const c = calcCost(items, byId, factor);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper">
      <table className="w-full text-sm">
        <thead className="bg-sand text-xs text-muted">
          <tr><th className="px-3 py-2 text-left font-medium">材料</th><th className="px-2 py-2 text-right font-medium">分量</th><th className="px-3 py-2 text-right font-medium">原価</th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const l = c.lines[i];
            const qty = it.qty === null ? null : it.qty * factor;
            return (
              <tr key={i} className="border-t border-line align-top">
                <td className="px-3 py-2">
                  <span className="block">{it.name}</span>
                  {it.note && <span className="block text-xs text-muted">{it.note}</span>}
                  {l.missing && <Link to="/ingredients" className="block text-xs text-warn-strong underline">{MISSING_TEXT[l.missing]}</Link>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  {it.unit === "適量" ? "適量" : `${formatQty(qty)}${it.unit}`}
                  {l.grams !== null && it.unit !== "g" && <span className="block text-xs text-muted">{formatQty(l.grams)}g</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{l.cost === null ? <span className="text-faint">—</span> : yen(l.cost)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-line-strong font-bold">
          <tr><td className="px-3 py-2">合計</td><td className="px-2 py-2 text-right">{formatQty(c.totalGrams)}g</td><td className="px-3 py-2 text-right">{yen(c.total)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}
