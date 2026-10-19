// レシピの一覧（トップ）。値上がりのお知らせ → 探す → 一覧。新しく作るのは右上
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { allergenName } from "@shared/allergens";
import { yen } from "@shared/cost";
import type { Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { useIngredients } from "../hooks/useIngredients";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { AlertList } from "../components/recipe/AlertList";
import { RateBadge } from "../components/recipe/RateBadge";
import { applyFilter, EMPTY_FILTER, RecipeFilters, type Filter } from "../components/recipe/RecipeFilters";

export function RecipesPage() {
  const { orgId, org, canEdit } = useOrgCtx();
  const [archived, setArchived] = useState(false);
  const [f, setF] = useState<Filter>(EMPTY_FILTER);
  const { list, loading } = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", archived]], orderBy: ["updatedAt", "desc"] });
  const ings = useIngredients(orgId);
  const tags = useMemo(() => [...new Set(list.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b, "ja")), [list]);
  const shown = applyFilter(list, f);

  return (
    <div className="space-y-4">
      <PageHead title="レシピ" right={canEdit && (
        <Link to="/recipes/new" className={`${ui.primary} flex items-center gap-1 py-2`}><Icon name="plus" className="h-4 w-4" />新しく作る</Link>
      )} />
      <AlertList orgId={orgId} canEdit={canEdit} />
      <RecipeFilters f={f} set={setF} tags={tags} ingredients={ings.list} />

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
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id}>
                <Link to={`/recipes/${r.id}`} className={`${ui.card} block space-y-1.5 py-3`}>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted">{r.category}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-ink-soft">1個 {yen(r.costCache?.perPiece)}</span>
                    {r.sellingPrice ? <span className="text-muted">／ 売価 {yen(r.sellingPrice)}</span> : null}
                    <RateBadge rate={r.costCache?.rate ?? null} target={r.targetCostRate ?? org.settings.targetCostRate} />
                    {!!r.costCache?.missing && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn-strong">単価なし {r.costCache.missing}</span>}
                  </div>
                  {(r.allergens?.length ?? 0) > 0 && (
                    <p className="truncate text-[11px] text-muted">アレルゲン：{r.allergens.map(allergenName).join("・")}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {!shown.length && <p className="py-6 text-center text-sm text-muted">条件に合うレシピがありません。</p>}
        </>
      )}
      <button className={ui.quiet} onClick={() => setArchived(!archived)}>{archived ? "いつものレシピに戻る" : "しまったレシピを見る"}</button>
    </div>
  );
}
