// 原価のまとめと、売価の逆算（目標の原価率から、いくらで売ればよいか）。1個あたりは材料＋包装
import { useState } from "react";
import { Link } from "react-router-dom";
import { calcCost, costRate, percent, suggestPrice, TAX_RATES, withTax, yen } from "@shared/cost";
import { calcPackaging, packLineText, type PackCtx } from "@shared/packaging";
import type { Ingredient, Recipe } from "@shared/types";
import { RateBadge } from "./RateBadge";

export function CostPanel({ recipe, byId, pack, defaultTarget }: { recipe: Recipe; byId: Map<string, Ingredient>; pack: PackCtx; defaultTarget: number }) {
  const base = recipe.targetCostRate ?? defaultTarget;
  const [target, setTarget] = useState(Math.round(base * 100));
  const c = calcCost(recipe.items, byId);
  const pieces = recipe.yield.pieces || 1;
  const p = calcPackaging(recipe.packaging, pack);
  const lines = recipe.packaging ?? [];
  const per = c.total / pieces + p.perPiece;
  const missing = c.missing + p.missing;
  const rate = costRate(per, recipe.sellingPrice);
  const price = suggestPrice(per, target / 100);

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-paper p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Cell label={`材料 1ロット（${pieces}個）`} value={yen(c.total)} />
        <Cell label="1個あたり" value={yen(per)} strong />
        <Cell label="売価（税抜）" value={recipe.sellingPrice ? yen(recipe.sellingPrice) : "未定"} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <RateBadge rate={rate} target={base} />
        <span className="text-xs text-muted">目標 {percent(base)}</span>
      </div>
      {lines.length > 0 && (
        <p className="text-center text-xs text-muted">
          1個あたり＝材料 {yen(c.total / pieces)}＋包装 {yen(p.perPiece)}（{lines.map(packLineText).join("・")}）
        </p>
      )}
      {missing > 0 && (
        <p className="rounded-xl bg-warn-soft p-2 text-xs text-warn-strong">
          {c.missing > 0 && `${c.missing}つの材料が原価に入っていません（下の表に理由があります）。`}
          {p.missing > 0 && <>包装の{p.missing}つに値段がありません（<Link to="/packaging" className="underline">包装資材</Link>で入れられます）。</>}
          実際の原価はこれより高くなります。
        </p>
      )}
      <div className="space-y-2 rounded-xl bg-sand p-3">
        <p className="text-sm font-bold">売価の目安（逆算）</p>
        <label className="flex items-center gap-2 text-sm">
          原価率
          <input type="range" min={10} max={60} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="flex-1 accent-clay" />
          <span className="w-12 text-right font-bold">{target}%</span>
        </label>
        {price > 0 ? (
          <p className="text-sm">
            税抜 <b className="text-lg">{yen(price)}</b>
            <span className="ml-2 text-xs text-muted">持ち帰り {yen(withTax(price, TAX_RATES.takeout))}／店内 {yen(withTax(price, TAX_RATES.eatIn))}（税込）</span>
          </p>
        ) : <p className="text-xs text-muted">材料の仕入れ値を入れると計算できます。</p>}
        <p className="text-[11px] text-muted">10円単位で切り上げています。{lines.length ? "包装は入っています。" : "包装は入っていません（レシピを直すと付けられます）。"}人件費は入っていません。</p>
      </div>
    </section>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-sand px-1 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={strong ? "text-lg font-bold text-clay-strong" : "font-bold"}>{value}</p>
    </div>
  );
}
