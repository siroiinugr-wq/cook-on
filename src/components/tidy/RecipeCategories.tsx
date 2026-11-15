// レシピの分類：分類（焼菓子・ケーキ）・種類（クッキー・パウンドケーキ）と、自家製材料（タルト生地・クリームなど、ほかのレシピの材料として作るもの）。
// AIが案を出し（30件で1クレジット）、人が一覧で直してまとめて確定する（setRecipeCategories。版は上げない）。
// 自家製材料にしたレシピは、同じ名前の材料があればそれに、無ければ新しく材料を作って結ぶ（UseAsIngredient と同じ）
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { recipeCategoryCredits, RECIPE_CATEGORY_MAX } from "@shared/credits";
import { HOMEMADE_CATEGORY, madeFromCandidates, madeFromPatch } from "@shared/madeFrom";
import type { Ingredient, Recipe } from "@shared/types";
import { createIngredient } from "../../lib/ingredientLink";
import { call, newRequestId, saveDoc } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";

interface Suggestion { recipeId: string; category: string; subcategory: string; component: boolean; confidence: number }
type Row = { category: string; subcategory: string; component: boolean; low?: boolean };

export function RecipeCategories({ orgId, uid, recipes, ings, credits }: {
  orgId: string; uid: string; recipes: Recipe[]; ings: { list: Ingredient[]; byId: Map<string, Ingredient> }; credits: number;
}) {
  const [all, setAll] = useState(false);
  const linked = useMemo(() => new Set(ings.list.flatMap((i) => (i.madeFrom ? [i.madeFrom] : []))), [ings.list]);
  const targets = useMemo(() => (all ? recipes : recipes.filter((r) => !r.category?.trim()))
    .slice().sort((a, b) => a.name.localeCompare(b.name, "ja")).slice(0, RECIPE_CATEGORY_MAX), [recipes, all]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = useCreditAction(credits);
  const cost = recipeCategoryCredits(targets.length);

  async function suggest() {
    setBusy(true);
    setMsg("");
    try {
      const r = await run({
        title: `レシピ${targets.length}件の分類の案を作る`, credits: cost,
        exec: () => call<{ suggestions: Suggestion[] }>("suggestRecipeCategories", { orgId, recipeIds: targets.map((x) => x.id), requestId: newRequestId() }),
      });
      if (r) {
        setRows((cur) => ({ ...cur, ...Object.fromEntries(r.suggestions.map((s) => [s.recipeId, { category: s.category, subcategory: s.subcategory, component: s.component, low: s.confidence < 0.6 }])) }));
        const home = r.suggestions.filter((s) => s.component).length;
        setMsg(`${r.suggestions.length}件の案を入れました${home ? `（うち自家製材料${home}件）` : ""}。直してから「確定」を押してください。`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const value = (r: Recipe): Row => rows[r.id] ?? { category: r.category ?? "", subcategory: r.subcategory ?? "", component: linked.has(r.id) || r.category === HOMEMADE_CATEGORY };
  const changed = targets.filter((r) => {
    const v = value(r);
    const catChanged = v.category.trim() !== (r.category ?? "") || v.subcategory.trim() !== (r.subcategory ?? "");
    return catChanged || (v.component && !linked.has(r.id));
  });

  async function confirmAll() {
    setBusy(true);
    setMsg("");
    try {
      const cats = changed.filter((r) => {
        const v = value(r);
        return v.category.trim() !== (r.category ?? "") || v.subcategory.trim() !== (r.subcategory ?? "");
      }).map((r) => ({ recipeId: r.id, category: value(r).category.trim(), subcategory: value(r).subcategory.trim() }));
      if (cats.length) await call("setRecipeCategories", { orgId, rows: cats });
      // 自家製材料：同じ名前の材料（まだ結んでいない・このレシピの中身に使っていない）があれば結び、無ければ作る
      let made = 0;
      for (const r of changed.filter((x) => value(x).component && !linked.has(x.id))) {
        const uses = new Set(r.ingredientIds ?? []);
        const same = ings.list.find((i) => !i.madeFrom && !uses.has(i.id) && madeFromCandidates(i, [r]).length > 0);
        const { missing: _m, ...p } = madeFromPatch(r.items, ings.byId);
        if (same) await saveDoc(`organizations/${orgId}/ingredients/${same.id}`, { madeFrom: r.id, ...p });
        else await createIngredient(orgId, uid, { name: r.name, madeFrom: r.id, ...p });
        made++;
      }
      setMsg(`${cats.length}件の分類を確定しました${made ? `。${made}件を自家製の材料にしました（値段・アレルゲンはレシピの中身から入ります）` : ""}。`);
      setRows({});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存できなかったレシピがあります。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        レシピの一覧は分類ごとにまとまります。AIが名前と材料から分類・種類を考え、タルト生地・クリームのように
        ほかのレシピの材料として作るものは「自家製材料」として別にします。分類は版を上げずに直すので、履歴は増えません。
      </p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-clay" checked={all} onChange={(e) => setAll(e.target.checked)} />分類が入っているレシピも出す</label>
      {!targets.length ? <p className="text-sm text-muted">すべてのレシピに分類が入っています。</p> : (
        <>
          <button disabled={busy} onClick={suggest} className={`w-full ${ui.secondary}`}>
            {busy ? "考えています…" : `AIで${targets.length}件の分類の案を出す`}<CostTag credits={cost} />
          </button>
          <ul className="divide-y divide-line">
            {targets.map((r) => {
              const v = value(r);
              const set = (p: Partial<Row>) => setRows((cur) => ({ ...cur, [r.id]: { ...(cur[r.id] ?? v), ...p, low: false } }));
              return (
                <li key={r.id} className="space-y-1 py-2">
                  <div className="flex items-baseline gap-2 text-sm">
                    <Link to={`/recipes/${r.id}`} className="min-w-0 flex-1 truncate underline decoration-line-strong underline-offset-2">{r.name}</Link>
                    <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{r.items.slice(0, 3).map((i) => i.name).join("・")}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm ${v.low ? "border-warn bg-warn-soft" : "border-line-strong"}`} value={v.category}
                      placeholder="分類" onChange={(e) => set({ category: e.target.value, component: e.target.value.trim() === HOMEMADE_CATEGORY || (v.component && linked.has(r.id)) })} />
                    <input className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm ${v.low ? "border-warn bg-warn-soft" : "border-line-strong"}`} value={v.subcategory}
                      placeholder="種類" onChange={(e) => set({ subcategory: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" className="accent-clay" checked={v.component} disabled={linked.has(r.id)}
                      onChange={(e) => set({ component: e.target.checked, category: e.target.checked ? HOMEMADE_CATEGORY : v.category === HOMEMADE_CATEGORY ? "" : v.category })} />
                    自家製材料（ほかのレシピの材料として使う）{linked.has(r.id) && <span className="text-muted">・材料に結んであります</span>}
                  </label>
                  {v.low && <p className="text-[11px] text-warn-strong">AIの自信が低い案です。確かめてください。</p>}
                </li>
              );
            })}
          </ul>
          <button disabled={busy || !changed.length} onClick={confirmAll} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : `${changed.length}件を確定する`}</button>
        </>
      )}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
