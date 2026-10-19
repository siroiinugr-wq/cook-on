// レシピの詳細：倍率 → 材料と原価 → 作り方。作業モード・ラベル・履歴・AI相談はここから
import { Link, useNavigate, useParams } from "react-router-dom";
import { allergenName } from "@shared/allergens";
import { scaleFactor } from "@shared/cost";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useRecipe, useScale } from "../hooks/useRecipe";
import { call } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { Accordion } from "../components/common/Accordion";
import { useConfirm } from "../components/common/ConfirmDialog";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { AiSuggest } from "../components/recipe/AiSuggest";
import { CostPanel } from "../components/recipe/CostPanel";
import { ItemsTable } from "../components/recipe/ItemsTable";
import { ScaleControl } from "../components/recipe/ScaleControl";
import { VersionHistory } from "../components/recipe/VersionHistory";

export function RecipeDetailPage() {
  const { id } = useParams();
  const { orgId, org, canEdit } = useOrgCtx();
  const { recipe, loading } = useRecipe(orgId, id);
  const ings = useIngredients(orgId);
  const [mode, setMode] = useScale();
  const confirm = useConfirm();
  const nav = useNavigate();

  if (loading) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  if (!recipe) return <div className="space-y-3 py-10 text-center"><p>レシピが見つかりません。</p><Link to="/" className={ui.quiet}>一覧へ</Link></div>;

  const archived = (recipe as { archived?: boolean }).archived === true;
  const pieces = recipe.yield.pieces || 1;
  const factor = scaleFactor(mode, pieces);
  const q = window.location.search;

  async function toggleArchive() {
    const ok = await confirm(archived
      ? { title: "一覧に戻しますか？", body: "いつものレシピの一覧に表示されます。", ok: "戻す" }
      : { title: "しまいますか？", body: "一覧から外れます（消えません）。「しまったレシピを見る」からいつでも戻せます。", ok: "しまう" });
    if (!ok) return;
    await call("archiveRecipe", { orgId, recipeId: recipe!.id, archived: !archived });
    if (!archived) nav("/");
  }

  return (
    <div className="space-y-4">
      <PageHead title={recipe.name} back="/" right={canEdit && <Link to={`/recipes/${recipe.id}/edit`} className={`${ui.secondary} py-2 text-sm`}>直す</Link>} />
      <div className="flex flex-wrap gap-1.5 text-xs">
        {recipe.category && <span className={ui.chip}>{recipe.category}</span>}
        {recipe.tags.map((t) => <span key={t} className={ui.chip}>#{t}</span>)}
        <span className="text-muted">第{recipe.version}版</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link to={`/recipes/${recipe.id}/work${q}`} className={`${ui.primary} flex items-center justify-center gap-1.5`}><Icon name="play" />作業モード</Link>
        <Link to={`/recipes/${recipe.id}/label${q}`} className={`${ui.secondary} flex items-center justify-center gap-1.5`}><Icon name="printer" />ラベルを作る</Link>
      </div>

      <CostPanel recipe={recipe} byId={ings.byId} defaultTarget={org.settings.targetCostRate} />

      <ScaleControl mode={mode} set={setMode} pieces={pieces} />
      <ItemsTable items={recipe.items} byId={ings.byId} factor={factor} />

      <section className={ui.card}>
        <p className="mb-1 text-sm font-bold">アレルゲン（材料の一覧から）</p>
        <p className="text-sm">{recipe.allergens.length ? recipe.allergens.map(allergenName).join("・") : "登録された材料には含まれていません"}</p>
      </section>

      {recipe.steps.length > 0 && (
        <section className={`${ui.card} space-y-2`}>
          <p className="text-sm font-bold">作り方</p>
          <ol className="space-y-2">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay-soft text-xs font-bold text-clay-strong">{i + 1}</span><span className="pt-0.5">{s.text}</span></li>
            ))}
          </ol>
        </section>
      )}
      {recipe.memo && <p className={`${ui.card} whitespace-pre-wrap text-sm text-ink-soft`}>{recipe.memo}</p>}

      {canEdit && (
        <Accordion title="AIに相談" summary="原価を下げる案・新しい商品の案">
          <AiSuggest orgId={orgId} recipeId={recipe.id} credits={org.credits} />
        </Accordion>
      )}
      <Accordion title="変更履歴" summary={`第${recipe.version}版。前の版に戻せます`}>
        <VersionHistory orgId={orgId} recipe={recipe} canEdit={canEdit} />
      </Accordion>
      {canEdit && <button className={ui.quiet} onClick={toggleArchive}>{archived ? "一覧に戻す" : "このレシピをしまう"}</button>}
    </div>
  );
}
