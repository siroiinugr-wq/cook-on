// お店の材料が結びついている「共有の材料」の情報：参考価格（この値段を入れる）と、100gあたりの成分。
// 参考価格は店頭の値段（税込）なので、入れるときに税抜に直す。入れたあとはお店が手で直してよい
import { MEXT_CREDIT, NUTRIENT_LABELS } from "@shared/mext";
import { ESTAT_CREDIT, refPriceExTax } from "@shared/refPrice";
import { yen } from "@shared/cost";
import type { GlobalIngredient } from "@shared/types";
import type { Unit } from "@shared/units";
import { useDoc } from "../../hooks/useData";

const SOURCE: Record<GlobalIngredient["source"], string> = { mext: "食品成分表", base: "COOK ON の基本の材料", ugc: "お店どうしで確かめた既製品" };
const SHOWN = ["kcal", "protein", "fat", "carbohydrate", "salt"];

export function GlobalInfo({ globalRef, onApply }: { globalRef: string; onApply?: (p: { price: number; qty: number; unit: Unit }) => void }) {
  const { data: g } = useDoc<GlobalIngredient>(`globalIngredients/${globalRef}`);
  if (!g) return null;
  const n = g.nutrition ?? {};
  const rp = g.refPrice;
  const hasNutrition = SHOWN.some((k) => typeof n[k] === "number");
  return (
    <div className="space-y-2 rounded-xl bg-sand p-3 text-sm">
      <p className="text-xs text-muted">共有の材料「{g.name}」（{SOURCE[g.source] ?? g.source}）と結びついています</p>
      {rp && (
        <div className="space-y-1">
          <p><b>参考価格</b> {yen(rp.price)}（税込）/{rp.qty}{rp.unit}　<span className="text-xs text-muted">税抜 {yen(refPriceExTax(rp))}</span></p>
          <p className="text-xs text-muted">{rp.item}・{rp.area}・{rp.asOf.replace("-", "年")}月。お店の仕入れ値とは違うので、目安として使ってください。</p>
          {onApply && <button type="button" onClick={() => onApply({ price: refPriceExTax(rp), qty: rp.qty, unit: rp.unit })} className="text-clay-strong underline">この値段（税抜）を仕入れ値に入れる</button>}
        </div>
      )}
      {hasNutrition && (
        <p className="text-xs">
          100gあたり：{SHOWN.filter((k) => typeof n[k] === "number").map((k) => `${NUTRIENT_LABELS[k]} ${n[k]}${k === "kcal" ? "kcal" : "g"}`).join("・")}
        </p>
      )}
      {g.source === "mext" && <p className="text-xs text-muted">アレルゲンは成分表の食品名から推定しています。お店で確かめてください。</p>}
      {(g.mextCode || g.source === "mext") && <p className="text-[11px] text-faint">{MEXT_CREDIT}</p>}
      {rp?.source.includes("小売物価統計") && <p className="text-[11px] text-faint">{ESTAT_CREDIT}</p>}
    </div>
  );
}
