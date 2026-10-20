// 既製品（メーカーの商品）の原材料。お店どうしで登録し、良い／違うで確かめ合う。
// 良いが十分に集まると共有の材料に昇格し、どのお店でも名寄せの候補に出る
import { useState } from "react";
import { allergenName } from "@shared/allergens";
import { PROMOTE_MIN_GOOD } from "@shared/ugc";
import type { UgcProduct } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { useIngredients } from "../hooks/useIngredients";
import { createIngredient } from "../lib/ingredientLink";
import { saveDoc } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { ProductForm } from "../components/ingredient/ProductForm";

export function ProductsPage() {
  const { orgId, uid, org, canEdit } = useOrgCtx();
  const { list, loading } = useCol<UgcProduct>("ugcProducts", { where: [["status", "in", ["pending", "promoted"]]], orderBy: ["createdAt", "desc"], limit: 200 });
  const votes = useCol<{ value: 1 | -1 }>(`organizations/${orgId}/ugcVotes`);
  const own = useIngredients(orgId);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(false);
  const [msg, setMsg] = useState("");
  const myVote = new Map(votes.list.map((v) => [v.id, v.value]));
  const shown = list.filter((p) => !q.trim() || `${p.maker}${p.productName}`.includes(q.trim()));

  const vote = (id: string, value: 1 | -1) => saveDoc(`organizations/${orgId}/ugcVotes/${id}`, { value, uid, at: new Date() }, { merge: false, stamp: false })
    .catch(() => setMsg("評価できませんでした。もう一度お試しください。"));

  async function addToMine(p: UgcProduct) {
    const ref = p.status === "promoted" ? `ugc_${p.id}` : null;
    if (ref && own.list.some((i) => i.globalRef === ref)) return setMsg(`「${p.productName}」はもうお店の材料にあります。`);
    await createIngredient(orgId, uid, { name: p.productName, labelName: `${p.productName}（${p.ingredientsText}）`.slice(0, 300), allergens: p.allergens, globalRef: ref });
    setMsg(`「${p.productName}」をお店の材料に加えました。仕入れ値を「材料」の画面で入れてください。`);
  }

  return (
    <div className="space-y-4">
      <PageHead title="既製品" back="/ingredients" right={canEdit && <button onClick={() => setForm(true)} className={`${ui.primary} flex items-center gap-1 py-2`}><Icon name="plus" className="h-4 w-4" />登録</button>} />
      <p className="text-sm text-ink-soft">お店どうしで登録した既製品の原材料です。合っていれば「良い」、違えば「違う」を押してください。良いが{PROMOTE_MIN_GOOD}件集まると共有の材料になります。</p>
      <input className={ui.input} placeholder="メーカー・商品名で探す" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <p className="rounded-xl bg-sand p-3 text-sm">{msg}</p>}
      {loading ? <p className="py-8 text-center text-muted">読み込み中…</p> : !shown.length ? <p className="py-8 text-center text-sm text-muted">見つかりません。右上から登録できます。</p> : (
        <ul className="space-y-2">
          {shown.map((p) => {
            const mine = p.createdByOrg === orgId;
            const v = myVote.get(p.id);
            return (
              <li key={p.id} className={`${ui.card} space-y-2`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">{p.maker}</p>
                    <p className="font-bold">{p.productName}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.status === "promoted" ? "bg-ok-soft text-ok-strong" : "bg-sand text-muted"}`}>{p.status === "promoted" ? "確認済み" : "確認中"}</span>
                </div>
                <p className="text-sm">{p.ingredientsText}</p>
                {p.allergens.length > 0 && <p className="text-xs text-muted">アレルゲン：{p.allergens.map(allergenName).join("・")}</p>}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {canEdit && !mine ? (<>
                    <button onClick={() => vote(p.id, 1)} className={`flex items-center gap-1 rounded-full border px-3 py-1 ${v === 1 ? "border-ok bg-ok-soft text-ok-strong" : "border-line"}`}><Icon name="thumbUp" className="h-4 w-4" />良い {p.goodCount}</button>
                    <button onClick={() => vote(p.id, -1)} className={`flex items-center gap-1 rounded-full border px-3 py-1 ${v === -1 ? "border-ng bg-ng-soft text-ng-strong" : "border-line"}`}><Icon name="thumbDown" className="h-4 w-4" />違う {p.badCount}</button>
                  </>) : <span className="text-xs text-muted">良い {p.goodCount}・違う {p.badCount}{mine ? "（お店が登録）" : ""}</span>}
                  {canEdit && <button onClick={() => addToMine(p)} className="ml-auto text-clay-strong underline">お店の材料に加える</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <ProductForm orgId={orgId} credits={org.credits} onClose={() => setForm(false)} onDone={setMsg} />}
    </div>
  );
}
