// 材料の一覧（仕入れ値・アレルゲン）。単価が無い材料を上に出して、原価の抜けを埋めやすくする
import { RefBadge } from "../components/ingredient/RefBadge";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MaterialTabs } from "../components/nav/MaterialTabs";
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

  // 材料ごとに、使っているレシピ（材料の編集から、そのレシピへとべるように）
  const usedBy = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const r of recipes.list) for (const id of r.ingredientIds ?? []) m.set(id, [...(m.get(id) ?? []), { id: r.id, name: r.name }]);
    return m;
  }, [recipes.list]);
  const usedIn = useMemo(() => new Map([...usedBy].map(([k, v]) => [k, v.length])), [usedBy]);
  // ほかの画面（レシピの材料の行など）から「?open=材料のid」で来たら、その材料を開く
  const [params, setParams] = useSearchParams();
  const openId = params.get("open");
  // レシピから来たときは、保存・閉じたらそのレシピに戻る（自分のアプリの中のレシピの画面だけ）
  const [from, setFrom] = useState<string | null>(null);
  const nav = useNavigate();
  const close = () => {
    setEdit(null);
    if (from) { setFrom(null); nav(from); }
  };
  useEffect(() => {
    if (!openId || loading) return;
    const hit = list.find((i) => i.id === openId);
    if (hit && canEdit) {
      setEdit(hit);
      const f = params.get("from");
      setFrom(f && /^\/recipes\/[^/]+$/.test(f) ? f : null);
    }
    setParams({}, { replace: true });
  }, [openId, loading, list, setParams, canEdit]);
  const unconfirmed = list.filter((i) => i.allergensConfirmed !== true).length;
  const missing = list.filter((i) => unitCostPerGram(i) === null);
  const shown = (onlyMissing ? missing : list).filter((i) => !q.trim() || [i.name, i.labelName ?? "", ...(i.aliases ?? [])].some((n) => n.includes(q.trim())));

  return (
    <div className="space-y-4">
      <PageHead title="材料" right={canEdit && <button onClick={() => setEdit("new")} className={`${ui.primary} flex items-center gap-1 py-2`}><Icon name="plus" className="h-4 w-4" />登録</button>} />
      <MaterialTabs />
      {missing.length > 0 && (
        <button onClick={() => setOnlyMissing(!onlyMissing)} className={`w-full rounded-xl p-3 text-left text-sm ${onlyMissing ? "bg-warn text-white" : "bg-warn-soft text-warn-strong"}`}>
          仕入れ値が入っていない材料が{missing.length}件あります。{onlyMissing ? "（すべて表示に戻す）" : "押すとその材料だけ出します。"}
        </button>
      )}
      {canEdit && (missing.length > 0 || unconfirmed > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {missing.length > 0 && <Link to="/tidy#price" className="text-clay-strong underline">参考価格・ネットの値段をまとめて入れる</Link>}
          {missing.length > 0 && <Link to="/ingredients/invoices" className="text-clay-strong underline">レシートから入れる</Link>}
          {unconfirmed > 0 && <Link to="/tidy#allergen" className="text-warn-strong underline">アレルゲン未確認 {unconfirmed}件を確かめる</Link>}
        </div>
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
                    <p className="truncate font-medium">{i.name}{i.labelName && i.labelName !== i.name && <span className="ml-1.5 text-xs font-normal text-muted">表示：{i.labelName}</span>}</p>
                    {(i.aliases?.length ?? 0) > 0 && <p className="truncate text-[11px] text-faint">別名：{i.aliases!.join("・")}</p>}
                    <p className="truncate text-xs text-muted">
                      {i.allergensConfirmed !== true ? <span className="text-warn-strong">アレルゲン未確認{i.allergens.length ? `（候補：${i.allergens.map(allergenName).join("・")}）` : ""}</span> : i.allergens.length ? i.allergens.map(allergenName).join("・") : "アレルゲンなし"}
                      {usedIn.get(i.id) ? `／レシピ${usedIn.get(i.id)}件` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {i.purchasePrice === null ? <span className="text-warn-strong">仕入れ値なし</span> : <>
                      <p>{i.priceSource === "ref" && <RefBadge className="mr-1" />}{yen(i.purchasePrice)}<span className="text-xs text-muted">/{i.purchaseQty}{i.purchaseUnit}</span></p>
                      <p className="text-xs text-muted">{perG === null ? "gに換算できない" : `1kg ${yen(perG * 1000)}`}</p>
                    </>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <IngredientSheet orgId={orgId} uid={uid} ing={edit === "new" ? null : edit} usedIn={edit === "new" ? 0 : usedIn.get(edit.id) ?? 0} usedBy={edit === "new" ? [] : usedBy.get(edit.id) ?? []} onClose={close} />}
    </div>
  );
}
