// 「このレシピを材料として使う」：りんごのキャラメリゼ・クレームダマンド・タルト生地のように、お店で作ってほかのレシピに使うもの。
// 材料（Ingredient.madeFrom＝このレシピ）を作るか、同じ名前の材料があればこのレシピに結ぶ。
// 値段（材料の合計÷重さ）・アレルゲンは画面が入れ、成分（100gあたり）はサーバーが成分表から入れる（shared/madeFrom.ts・recipes/madeFrom.ts）
import { useState } from "react";
import { Link } from "react-router-dom";
import { madeFromCandidates, madeFromPatch } from "@shared/madeFrom";
import { yen } from "@shared/cost";
import type { Ingredient, Recipe } from "@shared/types";
import { createIngredient } from "../../lib/ingredientLink";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

export function UseAsIngredient({ orgId, uid, recipe, ings, canEdit }: {
  orgId: string; uid: string; recipe: Recipe; ings: { list: Ingredient[]; byId: Map<string, Ingredient> }; canEdit: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const linked = ings.list.filter((i) => i.madeFrom === recipe.id);
  // 同じ名前でまだ結んでいない材料（取り込みで名前だけ作られた「りんごのキャラメリゼ」など）。このレシピの中身に使っている材料は除く
  const uses = new Set(recipe.ingredientIds ?? recipe.items.map((it) => it.ingredientId).filter(Boolean));
  const same = ings.list.filter((i) => !i.madeFrom && !uses.has(i.id) && madeFromCandidates(i, [recipe]).length > 0);

  if (linked.length) {
    const i = linked[0];
    const n = i.nutrition;
    return (
      <section className={`${ui.card} space-y-1 text-sm`}>
        <p className="font-bold">材料としても使っています</p>
        <p>
          <Link to={`/ingredients?open=${i.id}&from=/recipes/${recipe.id}`} className="text-clay-strong underline">{i.name}</Link>
          ：{i.purchasePrice === null ? "値段はまだ出ません（中身に値段か重さの無い材料があります）" : `${i.purchaseQty.toLocaleString("ja-JP")}gで${yen(i.purchasePrice)}`}
          {n?.kcal !== undefined && <span className="text-muted">・100gあたり {n.kcal}kcal</span>}
        </p>
        <p className="text-xs text-muted">このレシピを直すと、材料の値段・アレルゲン・成分も自動で入れ直します。</p>
      </section>
    );
  }
  if (!canEdit) return null;

  async function go(target: Ingredient | null) {
    setBusy(true);
    setErr("");
    try {
      const { missing: _m, ...p } = madeFromPatch(recipe.items, ings.byId);
      if (target) await saveDoc(`organizations/${orgId}/ingredients/${target.id}`, { madeFrom: recipe.id, ...p });
      else await createIngredient(orgId, uid, { name: recipe.name, madeFrom: recipe.id, ...p });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${ui.card} space-y-2 text-sm`}>
      <p className="font-bold">ほかのレシピの材料として使う</p>
      <p className="text-xs text-muted">
        タルト生地・クレームダマンド・りんごのキャラメリゼのように、作ってほかのレシピに使うものなら、材料にできます。
        値段（材料の合計÷重さ）・アレルゲン・成分（100gあたり）がこのレシピの中身から入り、使うレシピの原価とラベルに反映されます。
      </p>
      {same.length > 0 ? (
        same.slice(0, 3).map((i) => (
          <button key={i.id} disabled={busy} onClick={() => go(i)} className={`w-full ${ui.secondary}`}>材料「{i.name}」をこのレシピから作る材料にする</button>
        ))
      ) : (
        <button disabled={busy} onClick={() => go(null)} className={`w-full ${ui.secondary}`}>{busy ? "作っています…" : `材料「${recipe.name}」を作る`}</button>
      )}
      {err && <p className="text-xs text-ng">{err}</p>}
    </section>
  );
}
