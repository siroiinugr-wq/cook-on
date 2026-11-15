// レシピの一覧（トップ）。値上がりのお知らせ → 見る範囲（商品・自家製材料・試作）と探す → 分類ごとのグループ。新しく作るのは右上
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { allergenName } from "@shared/allergens";
import { yen } from "@shared/cost";
import { isPlaceholderName } from "@shared/tidy";
import type { Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { useIngredients } from "../hooks/useIngredients";
import { usePhotoUrl } from "../lib/photos";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { AlertList } from "../components/recipe/AlertList";
import { RateBadge } from "../components/recipe/RateBadge";
import { applyFilter, categoryTree, EMPTY_FILTER, groupRecipes, homemadeIds, inView, RecipeFilters, VIEWS, type Filter, type RecipeView } from "../components/recipe/RecipeFilters";

/** グループを最初から開いておくのは、出ている件数がこれ以下のとき（多いときは見出しだけ並べる） */
const OPEN_ALL_MAX = 30;
const VIEW_KEY = "cookon-recipeView";
const EMPTY_TEXT: Partial<Record<RecipeView, string>> = {
  homemade: "自家製材料のレシピはまだありません。タルト生地・クリームなどのレシピを開いて「材料として使う」を押すか、データの整理の「レシピの分類」でAIに見分けてもらえます。",
  trial: "試作中のレシピはありません。レシピを開いて「試作の印を付ける」を押すと、ここに集まります。",
};

function loadView(): RecipeView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as RecipeView) : "all";
  } catch {
    return "all";
  }
}

export function RecipesPage() {
  const { orgId, org, canEdit } = useOrgCtx();
  const [archived, setArchived] = useState(false);
  const [f, setFilter] = useState<Filter>(() => ({ ...EMPTY_FILTER, view: loadView() }));
  const setF = (n: Filter) => {
    setFilter(n);
    try {
      localStorage.setItem(VIEW_KEY, n.view);
    } catch {
      // 覚えられなくても使える
    }
  };
  const { list, loading } = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", archived]], orderBy: ["updatedAt", "desc"] });
  const ings = useIngredients(orgId);
  const tags = useMemo(() => [...new Set(list.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b, "ja")), [list]);
  const homemade = useMemo(() => homemadeIds(list, ings.list), [list, ings.list]);
  const shown = applyFilter(list, f, homemade);
  const inThisView = useMemo(() => list.filter((r) => inView(r, f.view, homemade)), [list, f.view, homemade]);
  const cats = useMemo(() => categoryTree(f.view === "all" ? inThisView.filter((r) => !homemade.has(r.id)) : inThisView), [inThisView, f.view, homemade]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, list.filter((r) => inView(r, v.id, homemade)).length])) as Record<RecipeView, number>, [list, homemade]);
  // 探している・分類を選んでいるときは平らに並べ、そうでなければ分類ごとのグループ
  const flat = !!(f.text.trim() || f.category || f.tag || f.ingredientId || f.exclude.length);
  const groups = flat ? [] : groupRecipes(shown, homemade, f.view);
  const uncategorized = list.filter((r) => !r.category?.trim()).length;

  return (
    <div className="space-y-4">
      <PageHead title="レシピ" right={canEdit && (
        <div className="flex gap-1.5">
          <Link to="/labels" className={`${ui.secondary} flex items-center gap-1 py-2`} aria-label="ラベルをまとめて印刷"><Icon name="printer" className="h-4 w-4" /><span className="hidden sm:inline">ラベル</span></Link>
          <Link to="/import" className={`${ui.secondary} flex items-center gap-1 py-2`} aria-label="取り込む"><Icon name="upload" className="h-4 w-4" /><span className="hidden sm:inline">取り込む</span></Link>
          <Link to="/recipes/new" className={`${ui.primary} flex items-center gap-1 py-2`}><Icon name="plus" className="h-4 w-4" />新しく作る</Link>
        </div>
      )} />
      <AlertList orgId={orgId} canEdit={canEdit} />
      {canEdit && <TidyBanner list={list} />}
      <RecipeFilters f={f} set={setF} tags={tags} ingredients={ings.list} cats={cats} counts={counts} />
      {canEdit && list.length >= 10 && uncategorized > 0 && (
        <Link to="/tidy#category" className="flex items-center gap-2 rounded-xl bg-clay-soft p-3 text-sm text-clay-strong">
          <Icon name="sparkle" className="h-5 w-5 shrink-0" />
          <span className="flex-1">分類の無いレシピが{uncategorized}件あります。AIが分類と自家製材料を見分けて案を出します</span>
          <Icon name="chevron" className="h-4 w-4" />
        </Link>
      )}

      {loading ? <p className="py-8 text-center text-muted">読み込み中…</p> : !list.length ? (
        <div className={`${ui.card} space-y-3 text-center`}>
          <p className="text-ink-soft">{archived ? "しまったレシピはありません。" : "まだレシピがありません。"}</p>
          {!archived && canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link to="/recipes/new" className={ui.primary}>ひな形から作る</Link>
              <Link to="/import" className={ui.secondary}>今までのデータを取り込む</Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">{shown.length}件{shown.length !== list.length ? `（全${list.length}件中）` : ""}</p>
          {flat ? (
            <ul className="space-y-2">{shown.map((r) => <RecipeRow key={r.id} r={r} target={org.settings.targetCostRate} homemade={homemade.has(r.id)} />)}</ul>
          ) : groups.map((g) => (
            <details key={`${f.view}-${g.key}`} open={shown.length <= OPEN_ALL_MAX || groups.length === 1} className="group space-y-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1 py-1.5">
                <Icon name="chevron" className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
                <span className="font-bold">{g.title}</span>
                <span className="text-xs text-muted">{g.items.length}件</span>
              </summary>
              <ul className="space-y-2">{g.items.map((r) => <RecipeRow key={r.id} r={r} target={org.settings.targetCostRate} homemade={homemade.has(r.id)} />)}</ul>
            </details>
          ))}
          {!shown.length && <p className="py-6 text-center text-sm text-muted">{EMPTY_TEXT[f.view] && !flat ? EMPTY_TEXT[f.view] : "条件に合うレシピがありません。"}</p>}
        </>
      )}
      <button className={ui.quiet} onClick={() => setArchived(!archived)}>{archived ? "いつものレシピに戻る" : "しまったレシピを見る"}</button>
    </div>
  );
}

function RecipeRow({ r, target, homemade }: { r: Recipe; target: number; homemade: boolean }) {
  return (
    <li>
      <Link to={`/recipes/${r.id}`} className={`${ui.card} flex gap-3 py-3`}>
        {r.photos?.[0] && <Cover path={r.photos[0]} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline gap-2">
            {r.trial && <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn-strong">試作</span>}
            <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
            <span className="shrink-0 text-xs text-muted">{homemade ? "自家製材料" : [r.category, r.subcategory].filter(Boolean).join("・")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {homemade ? <span className="text-ink-soft">1ロット {yen(r.costCache?.total)}</span> : <>
              <span className="text-ink-soft">1個 {yen(r.costCache?.perPiece)}</span>
              {r.sellingPrice ? <span className="text-muted">／ 売価 {yen(r.sellingPrice)}</span> : null}
              <RateBadge rate={r.costCache?.rate ?? null} target={r.targetCostRate ?? target} />
            </>}
            {!!r.costCache?.missing && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn-strong">単価なし {r.costCache.missing}</span>}
          </div>
          {r.trial && r.trialNote ? <p className="truncate text-[11px] text-warn-strong">次の改善点：{r.trialNote}</p>
            : (r.allergens?.length ?? 0) > 0 && <p className="truncate text-[11px] text-muted">アレルゲン：{r.allergens.map(allergenName).join("・")}</p>}
        </div>
      </Link>
    </li>
  );
}

function Cover({ path }: { path: string }) {
  const url = usePhotoUrl(path);
  return <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-sand">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</span>;
}

/** 取り込んだままのレシピが残っていたら、データの整理へ案内する */
function TidyBanner({ list }: { list: Recipe[] }) {
  const n = list.filter((r) => isPlaceholderName(r.name) || ((r.yield?.pieces ?? 1) === 1 && r.items.length >= 4) || (r.costCache?.missing ?? 0) > 0).length;
  if (!n) return null;
  return (
    <Link to="/tidy" className="flex items-center gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn-strong">
      <Icon name="sparkle" className="h-5 w-5 shrink-0" />
      <span className="flex-1">見直しが必要なレシピが{n}件あります（名前・何個分・仕入れ値・アレルゲン）。データの整理へ</span>
      <Icon name="chevron" className="h-4 w-4" />
    </Link>
  );
}
