// レシピを作る・直す。新しく作るときはひな形を選んでから（白紙のフォームを最初に見せない）
// 保存は saveRecipe（Functions）だけ。前の版は自動で履歴に残る
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { calcCost, costRate, yen } from "@shared/cost";
import { calcPackaging } from "@shared/packaging";
import type { RecipeInput } from "@shared/recipe";
import { toMatchKey } from "@shared/matchKey";
import type { Ingredient, Recipe } from "@shared/types";
import { guessPieces, needsPieces } from "@shared/tidy";
import { useCol } from "../hooks/useData";
import { RecipePhotos } from "../components/recipe/edit/RecipePhotos";
import { NewRecipeStart } from "../components/recipe/edit/NewRecipeStart";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { usePackaging } from "../hooks/usePackaging";
import { useRecipe } from "../hooks/useRecipe";
import { call, newId } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { ui } from "../components/common/ui";
import { RateBadge } from "../components/recipe/RateBadge";
import { ItemsEditor, rowKey, type Row } from "../components/recipe/edit/ItemsEditor";
import { PackagingEditor } from "../components/recipe/edit/PackagingEditor";
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
  const pack = usePackaging(orgId);
  const nav = useNavigate();
  // 今までに使った分類とタグ（押すだけで入れられるように）
  const all = useCol<Recipe>(`organizations/${orgId}/recipes`);
  const usedCats = useMemo(() => countSort(all.list.map((r) => r.category)), [all.list]);
  const subsByCat = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of new Set(all.list.map((r) => r.category))) m.set(c, countSort(all.list.filter((r) => r.category === c).map((r) => r.subcategory ?? "")));
    return m;
  }, [all.list]);
  const usedTags = useMemo(() => countSort(all.list.flatMap((r) => r.tags ?? [])), [all.list]);
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

  if (!canEdit) return <p className="py-10 text-center text-muted">レシピを編集する権限がありません。</p>;
  if (id && (loading || !draft)) return <p className="py-10 text-center text-muted">{loading || ings.loading ? "読み込み中…" : "レシピが見つかりません。"}</p>;

  if (!draft) {
    return (
      <div className="space-y-4">
        <PageHead title="新しいレシピ" back="/" />
        <NewRecipeStart recipes={all.list.filter((r) => !(r as { archived?: boolean }).archived)} onStart={start} />
      </div>
    );
  }

  const d = draft;
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const pieces = d.yield.pieces || 1;
  const cost = calcCost(rows, ings.byId);
  const packCost = calcPackaging(d.packaging, pack.ctx);
  const per = cost.total / pieces + packCost.perPiece;
  const missing = cost.missing + packCost.missing;
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

  const tagList = tagText.split(/[、,，\s#＃]+/).map((t) => t.trim()).filter(Boolean);
  const toggleTag = (t: string) => setTagText((tagList.includes(t) ? tagList.filter((x) => x !== t) : [...tagList, t]).join("、"));
  const piecesHint = pieces === 1 ? guessPieces([d.name, d.memo ?? "", ...d.steps.map((x) => x.text)]) : null;
  const field = (label: string, el: ReactNode, cls = "") => <label className={`block space-y-1 ${cls}`}><span className={ui.label}>{label}</span>{el}</label>;
  return (
    <div className="space-y-5 pb-24">
      <PageHead title={id ? "レシピを編集" : "新しいレシピ"} back={id ? `/recipes/${id}` : "/"} />
      <section className="space-y-3">
        {field("レシピ名", <input className={ui.input} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />)}
        <RecipePhotos photos={d.photos ?? []} set={(photos) => set({ photos })} photoDir={photoDir} />
        <div className="space-y-1">
          {field("分類（焼菓子・料理・ドリンクなど）", <input className={ui.input} value={d.category} placeholder="焼菓子" onChange={(e) => set({ category: e.target.value })} />)}
          <Chips items={usedCats} on={(c) => c === d.category} onTap={(c) => set({ category: c === d.category ? "" : c, subcategory: c === d.category ? d.subcategory : "" })} />
        </div>
        <div className="space-y-1">
          {field("種類（パウンドケーキ・クッキー・和食など）", <input className={ui.input} value={d.subcategory ?? ""} placeholder="クッキー" onChange={(e) => set({ subcategory: e.target.value })} />)}
          <Chips items={subsByCat.get(d.category) ?? []} on={(c) => c === d.subcategory} onTap={(c) => set({ subcategory: c === d.subcategory ? "" : c })} />
        </div>
        <div className="space-y-1">
          {field("タグ（定番・ギフトなど自由に。、で区切る）", <input className={ui.input} value={tagText} placeholder="定番、ギフト" onChange={(e) => setTagText(e.target.value)} />)}
          <Chips items={usedTags} on={(t) => tagList.includes(t)} onTap={toggleTag} prefix="#" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            {field("1ロットで何個できる？", <input className={ui.input} inputMode="numeric" value={d.yield.pieces} onChange={(e) => set({ yield: { ...d.yield, pieces: Number(e.target.value.replace(/\D/g, "")) || 1 } })} />)}
            {piecesHint && <button className="text-xs text-clay-strong underline" onClick={() => set({ yield: { ...d.yield, pieces: piecesHint } })}>メモや工程に「{piecesHint}個分」とあります。入れる</button>}
            {needsPieces({ ...d, yield: { pieces } }, cost.lines.reduce((t, l) => t + (l.grams ?? 0), 0)) && !piecesHint && <p className="text-xs text-warn-strong">材料が多いのに1個のままです。何個分か入れてください。</p>}
          </div>
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
        <h2 className="font-bold">包装（1個あたり）</h2>
        <PackagingEditor lines={d.packaging ?? []} set={(packaging) => set({ packaging })} materials={pack.materials} sets={pack.sets} ctx={pack.ctx} />
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">作り方</h2>
        <StepsEditor steps={d.steps} set={(steps) => set({ steps })} photoDir={photoDir} orgId={orgId} uid={uid} />
      </section>
      {field("メモ（お店の中だけ）", <textarea className={`${ui.input} h-20`} value={d.memo ?? ""} onChange={(e) => set({ memo: e.target.value })} />)}
      {id && field("何を変えたか（履歴に残ります・任意）", <input className={ui.input} value={note} maxLength={100} placeholder="例：砂糖を10g減らした" onChange={(e) => setNote(e.target.value)} />)}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p>1個 <b>{yen(per)}</b>{missing > 0 && <span className="ml-1 text-xs text-warn-strong">（{missing}件 未計算）</span>}</p>
            <RateBadge rate={costRate(per, d.sellingPrice)} target={d.targetCostRate ?? org.settings.targetCostRate} />
          </div>
          <button onClick={save} disabled={busy || !d.name.trim()} className={ui.primary}>{busy ? "保存しています…" : "保存する"}</button>
        </div>
        {err && <p className="mx-auto mt-1 max-w-3xl text-sm text-ng">{err}</p>}
      </div>
    </div>
  );
}

/** 多く使っている順に（同じ数なら五十音順）。空は除く */
function countSort(xs: string[]): string[] {
  const m = new Map<string, number>();
  for (const x of xs) if (x?.trim()) m.set(x.trim(), (m.get(x.trim()) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).map(([k]) => k).slice(0, 30);
}

/** 今までに使ったもの。押すと入る・もう一度押すと外れる */
function Chips({ items, on, onTap, prefix = "" }: { items: string[]; on: (x: string) => boolean; onTap: (x: string) => void; prefix?: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <button key={x} type="button" onClick={() => onTap(x)}
          className={`rounded-full border px-2.5 py-1 text-xs ${on(x) ? "border-clay bg-clay-soft font-bold text-clay-strong" : "border-line text-muted"}`}>{prefix}{x}</button>
      ))}
    </div>
  );
}
