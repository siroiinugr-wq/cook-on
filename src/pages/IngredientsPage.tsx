// 材料の一覧（仕入れ値・アレルゲン）。単価が無い材料を上に出して、原価の抜けを埋めやすくする
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { allergenName } from "@shared/allergens";
import { unitCostPerGram, yen } from "@shared/cost";
import type { Ingredient, Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { useIngredients } from "../hooks/useIngredients";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { IngredientSheet } from "../components/ingredient/IngredientSheet";
import { PhotoThumb } from "../components/ingredient/PhotoThumb";

export function IngredientsPage() {
  const { orgId, uid, canEdit } = useOrgCtx();
  const { list, loading } = useIngredients(orgId);
  const recipes = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", false]] });
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [edit, setEdit] = useState<Ingredient | "new" | null>(null);

  const usedIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes.list) for (const id of r.ingredientIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [recipes.list]);
  const missing = list.filter((i) => unitCostPerGram(i) === null);
  const shown = (onlyMissing ? missing : list).filter((i) => !q.trim() || i.name.includes(q.trim()));

  return (
    <div className="space-y-4">
      <PageHead title="材料" right={canEdit && <button onClick={() => setEdit("new")} className={`${ui.primary} flex items-center gap-1 py-2`}><Icon name="plus" className="h-4 w-4" />登録</button>} />
      {missing.length > 0 && (
        <button onClick={() => setOnlyMissing(!onlyMissing)} className={`w-full rounded-xl p-3 text-left text-sm ${onlyMissing ? "bg-warn text-white" : "bg-warn-soft text-warn-strong"}`}>
          仕入れ値が入っていない材料が{missing.length}件あります。{onlyMissing ? "（すべて表示に戻す）" : "押すとその材料だけ出します。"}
        </button>
      )}
      <input className={ui.input} placeholder="材料名で探す" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? <p className="py-8 text-center text-muted">読み込み中…</p> : !list.length ? (
        <div className={`${ui.card} space-y-2 text-center text-sm`}>
          <p>まだ材料がありません。レシピを作ると、使った材料がここに加わります。</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
          {shown.map((i) => {
            const perG = unitCostPerGram(i);
            return (
              <li key={i.id}>
                <button disabled={!canEdit} onClick={() => setEdit(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <PhotoThumb path={i.photoPath} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="truncate text-xs text-muted">
                      {i.allergens.length ? i.allergens.map(allergenName).join("・") : "アレルゲンなし"}
                      {usedIn.get(i.id) ? `／レシピ${usedIn.get(i.id)}件` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {i.purchasePrice === null ? <span className="text-warn-strong">仕入れ値なし</span> : <>
                      <p>{yen(i.purchasePrice)}<span className="text-xs text-muted">/{i.purchaseQty}{i.purchaseUnit}</span></p>
                      <p className="text-xs text-muted">{perG === null ? "gに換算できない" : `1kg ${yen(perG * 1000)}`}</p>
                    </>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/products" className={`${ui.card} flex items-center gap-3 text-sm`}>
        <span className="text-clay"><Icon name="box" /></span>
        <span className="flex-1"><b className="block">既製品の原材料を探す・登録する</b><span className="text-muted">チョコやジャムなど、メーカーの商品の原材料とアレルゲン</span></span>
        <Icon name="chevron" className="h-4 w-4 text-faint" />
      </Link>
      {edit && <IngredientSheet orgId={orgId} uid={uid} ing={edit === "new" ? null : edit} usedIn={edit === "new" ? 0 : usedIn.get(edit.id) ?? 0} onClose={() => setEdit(null)} />}
    </div>
  );
}
