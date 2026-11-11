// レシピの栄養成分（1個あたり・100gあたり）。材料が結んだ共有の材料（食品成分表・既製品）の成分から計算した目安
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MEXT_CREDIT } from "@shared/mext";
import { LABEL_NUTRIENT_NAMES, LABEL_NUTRIENTS, nutrientText, recipeNutrition } from "@shared/nutrition";
import type { Ingredient, Recipe } from "@shared/types";
import { useNutritionOf } from "../../hooks/useRecipeNutrition";
import { ui } from "../common/ui";

export function NutritionCard({ recipe, byId, canEdit }: { recipe: Recipe; byId: Map<string, Ingredient>; canEdit: boolean }) {
  const { nutOf, ready } = useNutritionOf(useMemo(() => [recipe], [recipe]), byId);
  const n = useMemo(() => recipeNutrition(recipe.items, byId, nutOf, recipe.yield), [recipe, byId, nutOf]);
  if (!ready) return null;
  const tidy = canEdit && <Link to="/tidy#link" className="underline">データの整理で共有の材料に結ぶ</Link>;
  if (!n.perPiece) {
    return (
      <section className={`${ui.card} space-y-1 text-sm`}>
        <p className="font-bold">栄養成分</p>
        <p className="text-xs text-muted">材料が成分表（共有の材料）に結ばれていないので、まだ計算できません。{tidy}</p>
      </section>
    );
  }
  const cols: [string, Record<string, number>][] = [[n.gramsPerPiece ? `1個（${Math.round(n.gramsPerPiece)}g）` : "1個", n.perPiece]];
  if (n.per100) cols.push(["100gあたり", n.per100]);
  return (
    <section className={`${ui.card} space-y-2 text-sm`}>
      <p className="font-bold">栄養成分（目安）</p>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted"><th className="text-left font-normal" />{cols.map(([h]) => <th key={h} className="text-right font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {LABEL_NUTRIENTS.map((k) => (
            <tr key={k} className="border-t border-line">
              <td className="py-1">{LABEL_NUTRIENT_NAMES[k]}</td>
              {cols.map(([h, v]) => <td key={h} className="py-1 text-right tabular-nums">{nutrientText(k, v[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {n.missing.length > 0 && <p className="text-xs text-warn-strong">成分が分からず0として数えた材料：{n.missing.join("、")}。{tidy}</p>}
      <p className="text-xs text-muted">材料の成分表から計算した推定値です（焼いて減る水分は見ていません）。{n.missing.length ? "全部の材料の成分がそろうと、ラベルに「栄養成分表示」として入れられます。" : "ラベルを作る画面で「栄養成分表示」としてラベルに入れられます。"}</p>
      <p className="text-[11px] text-faint">{MEXT_CREDIT}</p>
    </section>
  );
}
