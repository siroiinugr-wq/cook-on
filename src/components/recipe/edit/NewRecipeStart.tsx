// 新しいレシピの始め方：分類 → 種類 → 似たレシピをコピーして始める（白紙のフォームを最初に見せない）。
// 分類と種類は、お店のレシピで使っているものが並ぶ（レシピに付けると増える）。下に最初から入っているひな形
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RECIPE_TEMPLATES, type RecipeInput } from "@shared/recipe";
import type { Recipe } from "@shared/types";
import { ui } from "../../common/ui";
import { categoryTree } from "../RecipeFilters";

const BLANK: RecipeInput = RECIPE_TEMPLATES.find((t) => t.id === "blank")!.recipe;

function copyOf(r: Recipe): RecipeInput {
  return {
    name: `${r.name}（コピー）`.slice(0, 60), category: r.category, subcategory: r.subcategory ?? "", tags: r.tags.filter((t) => t !== "取り込み"),
    items: r.items, steps: r.steps, yield: r.yield, sellingPrice: null, targetCostRate: r.targetCostRate, memo: "", packaging: r.packaging ?? [], photos: [],
  };
}

export function NewRecipeStart({ recipes, onStart }: { recipes: Recipe[]; onStart: (r: RecipeInput) => void }) {
  const cats = useMemo(() => categoryTree(recipes), [recipes]);
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const subs = cats.find((c) => c.name === cat)?.subs ?? [];
  const inCat = recipes.filter((r) => r.category === cat && (!sub || r.subcategory === sub))
    .sort((a, b) => a.name.localeCompare(b.name, "ja")).slice(0, 30);

  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm ${on ? "border-clay bg-clay font-bold text-white" : "border-line-strong bg-paper text-ink-soft"}`;
  return (
    <div className="space-y-5">
      {cats.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm text-ink-soft">分類を選ぶと、その中のレシピをコピーして始められます。</p>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => <button key={c.name} className={chip(cat === c.name)} onClick={() => { setCat(cat === c.name ? "" : c.name); setSub(""); }}>{c.name}</button>)}
          </div>
          {subs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-3">
              {subs.map((s) => <button key={s} className={`rounded-full px-3 py-1 text-xs ${sub === s ? "bg-clay-soft font-bold text-clay-strong" : "bg-sand text-ink-soft"}`} onClick={() => setSub(sub === s ? "" : s)}>{s}</button>)}
            </div>
          )}
          {cat && (
            <div className="space-y-2">
              <button className={`${ui.secondary} w-full py-2 text-sm`} onClick={() => onStart({ ...BLANK, name: "", category: cat, subcategory: sub })}>
                「{[cat, sub].filter(Boolean).join("・")}」で白紙から作る
              </button>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
                {inCat.map((r) => (
                  <li key={r.id}>
                    <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => onStart(copyOf(r))}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted">{r.subcategory ? `${r.subcategory}・` : ""}{r.items.slice(0, 4).map((i) => i.name).join("・")}</span></span>
                      <span className="shrink-0 text-xs text-clay-strong">コピーして始める</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <section className="space-y-2">
        <p className="text-sm text-ink-soft">{cats.length ? "最初から入っているひな形" : "近いものを選ぶと、材料と作り方が入った状態から始められます。"}</p>
        <div className="grid gap-2">
          {RECIPE_TEMPLATES.map((t) => (
            <button key={t.id} className={`${ui.card} text-left`} onClick={() => onStart(t.recipe)}>
              <p className="font-bold">{t.label}</p>
              <p className="text-xs text-muted">{t.recipe.items.map((i) => i.name).filter(Boolean).join("・") || "空のレシピ"}</p>
            </button>
          ))}
        </div>
      </section>
      <Link to="/import" className={`${ui.secondary} block text-center`}>今までのレシピをファイルから取り込む</Link>
    </div>
  );
}
