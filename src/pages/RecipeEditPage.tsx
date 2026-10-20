// レシピを作る・直す。新しく作るときはひな形を選んでから（白紙のフォームを最初に見せない）
// 保存は saveRecipe（Functions）だけ。前の版は自動で履歴に残る
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { calcCost, costRate, yen } from "@shared/cost";
import { RECIPE_TEMPLATES, type RecipeInput } from "@shared/recipe";
import { toMatchKey } from "@shared/matchKey";
import type { Ingredient } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useRecipe } from "../hooks/useRecipe";
import { call, newId } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { ui } from "../components/common/ui";
import { RateBadge } from "../components/recipe/RateBadge";
import { ItemsEditor, rowKey, type Row } from "../components/recipe/edit/ItemsEditor";
import { StepsEditor } from "../components/recipe/edit/StepsEditor";

type Draft = Omit<RecipeInput, "items">;

function toRows(input: RecipeInput, own: Ingredient[]): Row[] {
  // ひな形の材料は名前だけなので、お店に同じ名前の材料があれば結んでおく
  return input.items.map((it) => ({
    ...it, _k: rowKey(),
    ingredientId: it.ingredientId ?? own.find((i) => toMatchKey(i.name) === toMatchKey(it.name))?.id ?? null,
  }));
}

export function RecipeEditPage() {
  const { id } = useParams();
  const { orgId, uid, org, canEdit } = useOrgCtx();
  const { recipe, loading } = useRecipe(orgId, id);
  const ings = useIngredients(orgId);
  const nav = useNavigate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tagText, setTagText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const photoDir = useMemo(() => `orgs/${orgId}/recipes/${id ?? newId(`organizations/${orgId}/recipes`)}`, [orgId, id]);

  function start(input: RecipeInput) {
    const { items, ...rest } = input;
    setDraft(rest);
    setRows(toRows({ ...input, items }, ings.list));
    setTagText(input.tags.join("、"));
  }
  // 直すとき：読み込めたら1回だけフォームに入れる（あとから届く更新でフォームを上書きしない）
  useEffect(() => {
    if (id && recipe && !draft && !ings.loading) start(recipe);
  }, [id, recipe, draft, ings.loading]);

  if (!canEdit) return <p className="py-10 text-center text-muted">レシピを直す権限がありません。</p>;
  if (id && (loading || !draft)) return <p className="py-10 text-center text-muted">{loading || ings.loading ? "読み込み中…" : "レシピが見つかりません。"}</p>;

  if (!draft) {
    return (
      <div className="space-y-4">
        <PageHead title="新しいレシピ" back="/" />
        <p className="text-sm text-ink-soft">近いものを選ぶと、材料と作り方が入った状態から始められます。</p>
        <div className="grid gap-2">
          {RECIPE_TEMPLATES.map((t) => (
            <button key={t.id} className={`${ui.card} text-left`} onClick={() => start(t.recipe)}>
              <p className="font-bold">{t.label}</p>
              <p className="text-xs text-muted">{t.recipe.items.map((i) => i.name).filter(Boolean).join("・") || "空のレシピ"}</p>
            </button>
          ))}
        </div>
        <Link to="/import" className={`${ui.secondary} block text-center`}>今までのレシピをファイルから取り込む</Link>
      </div>
    );
  }

  const d = draft;
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const pieces = d.yield.pieces || 1;
  const cost = calcCost(rows, ings.byId);
  const per = cost.total / pieces;
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")) || null);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const tags = tagText.split(/[、,，\s#＃]+/).map((t) => t.trim()).filter(Boolean);
      const items = rows.map(({ _k, ...it }) => it);
      const r = await call<{ recipeId: string }>("saveRecipe", { orgId, recipeId: id ?? null, recipe: { ...d, tags, items }, note });
      nav(`/recipes/${r.recipeId}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const field = (label: string, el: ReactNode, cls = "") => <label className={`block space-y-1 ${cls}`}><span className={ui.label}>{label}</span>{el}</label>;
  return (
    <div className="space-y-5 pb-24">
      <PageHead title={id ? "レシピを直す" : "新しいレシピ"} back={id ? `/recipes/${id}` : "/"} />
      <section className="space-y-3">
        {field("レシピ名", <input className={ui.input} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />)}
        <div className="grid grid-cols-2 gap-2">
          {field("分類", <input className={ui.input} value={d.category} placeholder="焼き菓子" onChange={(e) => set({ category: e.target.value })} />)}
          {field("タグ（、で区切る）", <input className={ui.input} value={tagText} placeholder="定番、ギフト" onChange={(e) => setTagText(e.target.value)} />)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("1ロットで何個", <input className={ui.input} inputMode="numeric" value={d.yield.pieces} onChange={(e) => set({ yield: { ...d.yield, pieces: Number(e.target.value.replace(/\D/g, "")) || 1 } })} />)}
          {field("1個の重さ g（ラベル用・任意）", <input className={ui.input} inputMode="decimal" value={d.yield.gramsPerPiece ?? ""} onChange={(e) => set({ yield: { ...d.yield, gramsPerPiece: numOrNull(e.target.value) } })} />)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("売価（税抜・円）", <input className={ui.input} inputMode="numeric" value={d.sellingPrice ?? ""} placeholder="未定" onChange={(e) => set({ sellingPrice: numOrNull(e.target.value) })} />)}
          {field(`目標の原価率 %（空ならお店の${Math.round(org.settings.targetCostRate * 100)}%）`, <input className={ui.input} inputMode="decimal"
            value={d.targetCostRate === null ? "" : Math.round(d.targetCostRate * 1000) / 10} onChange={(e) => { const v = numOrNull(e.target.value); set({ targetCostRate: v ? v / 100 : null }); }} />)}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">材料（1ロット分）</h2>
        <ItemsEditor rows={rows} set={setRows} own={ings.list} orgId={orgId} uid={uid} credits={org.credits} />
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">作り方</h2>
        <StepsEditor steps={d.steps} set={(steps) => set({ steps })} photoDir={photoDir} />
      </section>
      {field("メモ（お店の中だけ）", <textarea className={`${ui.input} h-20`} value={d.memo ?? ""} onChange={(e) => set({ memo: e.target.value })} />)}
      {id && field("何を変えたか（履歴に残ります・任意）", <input className={ui.input} value={note} maxLength={100} placeholder="例：砂糖を10g減らした" onChange={(e) => setNote(e.target.value)} />)}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p>1個 <b>{yen(per)}</b>{cost.missing > 0 && <span className="ml-1 text-xs text-warn-strong">（{cost.missing}件 未計算）</span>}</p>
            <RateBadge rate={costRate(per, d.sellingPrice)} target={d.targetCostRate ?? org.settings.targetCostRate} />
          </div>
          <button onClick={save} disabled={busy || !d.name.trim()} className={ui.primary}>{busy ? "保存しています…" : "保存する"}</button>
        </div>
        {err && <p className="mx-auto mt-1 max-w-3xl text-sm text-ng">{err}</p>}
      </div>
    </div>
  );
}
