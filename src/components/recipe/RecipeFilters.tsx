// レシピの絞り込み：見る範囲（商品・自家製材料・試作）、言葉（名前・分類・タグ）、タグ、使っている材料（逆引き）、除きたいアレルゲン
import { ALLERGENS, type AllergenId } from "@shared/allergens";
import { HOMEMADE_CATEGORY } from "@shared/madeFrom";
import type { Ingredient, Recipe } from "@shared/types";
import { Accordion } from "../common/Accordion";
import { Icon } from "../common/Icon";
import { ui } from "../common/ui";

/** 見る範囲。自家製材料＝ほかのレシピの材料として作るレシピ（材料に結んだもの・分類が「自家製材料」のもの） */
export type RecipeView = "all" | "products" | "homemade" | "trial";
export const VIEWS: { id: RecipeView; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "products", label: "商品" },
  { id: "homemade", label: "自家製材料" },
  { id: "trial", label: "試作" },
];

export interface Filter {
  view: RecipeView;
  text: string;
  tag: string;
  category: string;
  subcategory: string;
  ingredientId: string;
  exclude: AllergenId[];
}
export const EMPTY_FILTER: Filter = { view: "all", text: "", tag: "", category: "", subcategory: "", ingredientId: "", exclude: [] };

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

/** 自家製材料のレシピ（材料の madeFrom で結んだもの＋分類が「自家製材料」のもの） */
export function homemadeIds(list: Recipe[], ingredients: Ingredient[]): Set<string> {
  const s = new Set(ingredients.flatMap((i) => (i.madeFrom ? [i.madeFrom] : [])));
  for (const r of list) if (r.category?.trim() === HOMEMADE_CATEGORY) s.add(r.id);
  return s;
}

export function inView(r: Recipe, view: RecipeView, homemade: Set<string>): boolean {
  if (view === "products") return !homemade.has(r.id);
  if (view === "homemade") return homemade.has(r.id);
  if (view === "trial") return r.trial === true;
  return true;
}

/**
 * 一覧を分類ごとのグループにする（使っている数の多い順・分類なしは最後）。
 * 「すべて」で見るときは自家製材料を分類にかかわらず最後の別グループにまとめる。グループの中は種類→名前の順
 */
export function groupRecipes(list: Recipe[], homemade: Set<string>, view: RecipeView): { key: string; title: string; items: Recipe[] }[] {
  const m = new Map<string, Recipe[]>();
  for (const r of list) {
    const home = homemade.has(r.id) && view !== "homemade";
    const k = home ? `\u0001${HOMEMADE_CATEGORY}` : r.category?.trim() || "";
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  const sortIn = (xs: Recipe[]) => [...xs].sort((a, b) => (a.subcategory || "\uffff").localeCompare(b.subcategory || "\uffff", "ja") || a.name.localeCompare(b.name, "ja"));
  return [...m.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length || a[0].localeCompare(b[0], "ja"))
    .map(([k, xs]) => ({ key: k || "_none", title: k.replace("\u0001", "") || "分類なし", items: sortIn(xs) }));
}
const rank = (k: string) => (k.startsWith("\u0001") ? 2 : k === "" ? 1 : 0);

export function applyFilter(list: Recipe[], f: Filter, homemade: Set<string> = new Set()): Recipe[] {
  const q = f.text.trim().toLowerCase();
  return list.filter((r) =>
    inView(r, f.view, homemade)
    && (!q || [r.name, r.category, r.subcategory ?? "", r.trialNote ?? "", ...r.tags].some((s) => s.toLowerCase().includes(q)))
    && (!f.category || r.category === f.category)
    && (!f.subcategory || r.subcategory === f.subcategory)
    && (!f.tag || r.tags.includes(f.tag))
    && (!f.ingredientId || r.ingredientIds?.includes(f.ingredientId))
    && !f.exclude.some((a) => r.allergens?.includes(a)));
}

export function RecipeFilters({ f, set, tags, ingredients, cats, counts }: {
  f: Filter; set: (f: Filter) => void; tags: string[]; ingredients: Ingredient[]; cats: { name: string; subs: string[] }[]; counts: Record<RecipeView, number>;
}) {
  const subs = cats.find((c) => c.name === f.category)?.subs ?? [];
  const toggle = (a: AllergenId) => set({ ...f, exclude: f.exclude.includes(a) ? f.exclude.filter((x) => x !== a) : [...f.exclude, a] });
  const ing = ingredients.find((i) => i.id === f.ingredientId);
  const summary = [f.tag && `#${f.tag}`, ing && `${ing.name}を使う`, f.exclude.length && `${f.exclude.length}品目を除く`].filter(Boolean).join("・");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-sand p-1" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={f.view === v.id} onClick={() => set({ ...f, view: v.id, category: "", subcategory: "" })}
            className={`rounded-lg px-1 py-1.5 text-xs ${f.view === v.id ? "bg-paper font-bold text-clay-strong shadow-sm" : "text-ink-soft"}`}>
            {v.label}<span className="ml-0.5 text-[10px] text-muted">{counts[v.id]}</span>
          </button>
        ))}
      </div>
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
