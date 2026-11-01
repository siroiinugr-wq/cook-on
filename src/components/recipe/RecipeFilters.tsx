// レシピの絞り込み：言葉（名前・分類・タグ）、タグ、使っている材料（逆引き）、除きたいアレルゲン
import { ALLERGENS, type AllergenId } from "@shared/allergens";
import type { Ingredient, Recipe } from "@shared/types";
import { Accordion } from "../common/Accordion";
import { Icon } from "../common/Icon";
import { ui } from "../common/ui";

export interface Filter {
  text: string;
  tag: string;
  category: string;
  subcategory: string;
  ingredientId: string;
  exclude: AllergenId[];
}
export const EMPTY_FILTER: Filter = { text: "", tag: "", category: "", subcategory: "", ingredientId: "", exclude: [] };

/** 分類 → その中の種類（使っている数の多い順） */
export function categoryTree(list: Recipe[]): { name: string; subs: string[] }[] {
  const m = new Map<string, Map<string, number>>();
  for (const r of list) {
    const c = r.category?.trim();
    if (!c) continue;
    const subs = m.get(c) ?? new Map<string, number>();
    const s = r.subcategory?.trim();
    if (s) subs.set(s, (subs.get(s) ?? 0) + 1);
    subs.set("", (subs.get("") ?? 0) + 1);
    m.set(c, subs);
  }
  return [...m.entries()].sort((a, b) => (b[1].get("") ?? 0) - (a[1].get("") ?? 0))
    .map(([name, subs]) => ({ name, subs: [...subs.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]).map(([k]) => k) }));
}

export function applyFilter(list: Recipe[], f: Filter): Recipe[] {
  const q = f.text.trim().toLowerCase();
  return list.filter((r) =>
    (!q || [r.name, r.category, r.subcategory ?? "", ...r.tags].some((s) => s.toLowerCase().includes(q)))
    && (!f.category || r.category === f.category)
    && (!f.subcategory || r.subcategory === f.subcategory)
    && (!f.tag || r.tags.includes(f.tag))
    && (!f.ingredientId || r.ingredientIds?.includes(f.ingredientId))
    && !f.exclude.some((a) => r.allergens?.includes(a)));
}

export function RecipeFilters({ f, set, tags, ingredients, cats }: { f: Filter; set: (f: Filter) => void; tags: string[]; ingredients: Ingredient[]; cats: { name: string; subs: string[] }[] }) {
  const subs = cats.find((c) => c.name === f.category)?.subs ?? [];
  const toggle = (a: AllergenId) => set({ ...f, exclude: f.exclude.includes(a) ? f.exclude.filter((x) => x !== a) : [...f.exclude, a] });
  const ing = ingredients.find((i) => i.id === f.ingredientId);
  const summary = [f.tag && `#${f.tag}`, ing && `${ing.name}を使う`, f.exclude.length && `${f.exclude.length}品目を除く`].filter(Boolean).join("・");
  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" className="h-4 w-4" /></span>
        <input className={`${ui.input} pl-9`} placeholder="名前・分類・種類・タグで探す" value={f.text} onChange={(e) => set({ ...f, text: e.target.value })} />
      </label>
      {cats.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button key={c.name} onClick={() => set({ ...f, category: f.category === c.name ? "" : c.name, subcategory: "" })}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${f.category === c.name ? "border-clay bg-clay font-bold text-white" : "border-line-strong bg-paper text-ink-soft"}`}>{c.name}</button>
          ))}
        </div>
      )}
      {subs.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 pl-3">
          {subs.map((s) => (
            <button key={s} onClick={() => set({ ...f, subcategory: f.subcategory === s ? "" : s })}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${f.subcategory === s ? "bg-clay-soft font-bold text-clay-strong" : "bg-sand text-ink-soft"}`}>{s}</button>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {tags.map((t) => (
            <button key={t} onClick={() => set({ ...f, tag: f.tag === t ? "" : t })}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${f.tag === t ? "bg-clay text-white" : "bg-sand text-ink-soft"}`}>#{t}</button>
          ))}
        </div>
      )}
      <Accordion title="材料・アレルギーでしぼる" summary={summary || "この材料を使うレシピ／含まないレシピ"}>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className={ui.label}>この材料を使っているレシピ（値上がりの影響を見るとき）</span>
            <select className={ui.input} value={f.ingredientId} onChange={(e) => set({ ...f, ingredientId: e.target.value })}>
              <option value="">指定しない</option>
              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <div className="space-y-1">
            <p className={ui.label}>含まないレシピだけ（押した品目を除きます）</p>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGENS.map((a) => (
                <button key={a.id} onClick={() => toggle(a.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${f.exclude.includes(a.id) ? "border-ng bg-ng-soft font-bold text-ng-strong line-through" : a.required ? "border-line-strong text-ink-soft" : "border-line text-muted"}`}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          {summary && <button className={ui.quiet} onClick={() => set({ ...EMPTY_FILTER, text: f.text })}>しぼりこみを外す</button>}
        </div>
      </Accordion>
    </div>
  );
}
