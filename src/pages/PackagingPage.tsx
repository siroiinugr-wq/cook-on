// 包装資材（袋・脱酸素剤・シール）と包装セット。レシピの編集で「1個あたり」に付けると原価に入る
import { useMemo, useState } from "react";
import { yen } from "@shared/cost";
import { packUnitCost, setCost } from "@shared/packaging";
import type { PackagingMaterial, PackagingSet, Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { usePackaging } from "../hooks/usePackaging";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { PackagingSheet } from "../components/packaging/PackagingSheet";
import { PackSetSheet } from "../components/packaging/PackSetSheet";

export function PackagingPage() {
  const { orgId, uid, canEdit } = useOrgCtx();
  const { materials, sets, ctx, loading } = usePackaging(orgId);
  const recipes = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", false]] });
  const [editMat, setEditMat] = useState<PackagingMaterial | "new" | null>(null);
  const [editSet, setEditSet] = useState<PackagingSet | "new" | null>(null);

  // 何件のレシピ（とセット）で使っているか。消すときの確認と、値段を変えたときの案内に使う
  const usedIn = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (id: string) => m.set(id, (m.get(id) ?? 0) + 1);
    for (const r of recipes.list) for (const id of [...(r.packagingIds ?? []), ...(r.packagingSetIds ?? [])]) bump(id);
    for (const s of sets) for (const it of s.items) bump(it.packagingId);
    return m;
  }, [recipes.list, sets]);

  const add = (onClick: () => void, label: string) => canEdit && (
    <button onClick={onClick} className={`${ui.secondary} flex items-center gap-1 py-1.5 text-sm`}><Icon name="plus" className="h-4 w-4" />{label}</button>
  );

  return (
    <div className="space-y-5">
      <PageHead title="包装資材" back="/ingredients" />
      <p className="text-sm text-ink-soft">袋・脱酸素剤・シールなどの値段を入れ、よく使う組み合わせをセットにしておくと、レシピに「1個あたり」で付けて原価に入れられます。</p>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-bold">セット</h2>{add(() => setEditSet("new"), "セットを作る")}</div>
        {loading ? <p className="py-4 text-center text-muted">読み込み中…</p> : !sets.length ? (
          <p className={`${ui.card} text-sm text-muted`}>まだセットがありません。例：「10cm袋＋脱酸素剤30＋シール」</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            {sets.map((s) => {
              const c = setCost(s, ctx.matById);
              return (
                <li key={s.id}>
                  <button disabled={!canEdit} onClick={() => setEditSet(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted">{s.items.map((it) => `${ctx.matById.get(it.packagingId)?.name ?? it.name}${it.qty !== 1 ? `×${it.qty}` : ""}`).join("＋")}</p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p>{yen(c.cost)}</p>
                      {c.missing > 0 ? <p className="text-xs text-warn-strong">値段なし{c.missing}つ</p> : usedIn.get(s.id) ? <p className="text-xs text-muted">レシピ{usedIn.get(s.id)}件</p> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-bold">資材</h2>{add(() => setEditMat("new"), "登録")}</div>
        {!loading && !materials.length ? (
          <p className={`${ui.card} text-sm text-muted`}>まだ資材がありません。「100枚で1,500円」のように、買ったときの値段と数を入れます。</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            {materials.map((m) => {
              const per = packUnitCost(m);
              return (
                <li key={m.id}>
                  <button disabled={!canEdit} onClick={() => setEditMat(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <p className="min-w-0 flex-1 truncate font-medium">{m.name}</p>
                    <div className="shrink-0 text-right text-sm">
                      {per === null ? <span className="text-warn-strong">値段なし</span> : <>
                        <p>1{m.unit} {yen(per)}</p>
                        <p className="text-xs text-muted">{yen(m.purchasePrice)}/{m.purchaseQty}{m.unit}（税抜）</p>
                      </>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editMat && <PackagingSheet orgId={orgId} uid={uid} mat={editMat === "new" ? null : editMat} usedIn={editMat === "new" ? 0 : usedIn.get(editMat.id) ?? 0} onClose={() => setEditMat(null)} />}
      {editSet && <PackSetSheet orgId={orgId} uid={uid} set={editSet === "new" ? null : editSet} materials={materials} usedIn={editSet === "new" ? 0 : usedIn.get(editSet.id) ?? 0} onClose={() => setEditSet(null)} />}
    </div>
  );
}
