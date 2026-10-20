// 原価高騰のお知らせ（材料の値上がりで、目標の原価率を超えたレシピ）。既読にすると消える
import { Link } from "react-router-dom";
import { percent } from "@shared/cost";
import { useCol } from "../../hooks/useData";
import { patchDoc } from "../../lib/store";
import { Icon } from "../common/Icon";

interface Alert { recipeId: string; recipeName: string; ingredientName: string; oldRate: number | null; newRate: number; target: number }

export function AlertList({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { list } = useCol<Alert>(`organizations/${orgId}/alerts`, { where: [["read", "==", false]], orderBy: ["createdAt", "desc"], limit: 5 });
  if (!list.length) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-ng/30 bg-ng-soft p-3">
      <p className="flex items-center gap-1 text-sm font-bold text-ng-strong"><Icon name="alert" className="h-4 w-4" />値上がりで目標の原価率を超えたレシピ</p>
      {list.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-xl bg-paper p-2.5 text-sm">
          <Link to={`/recipes/${a.recipeId}`} className="min-w-0 flex-1">
            <span className="block truncate font-medium">{a.recipeName}</span>
            <span className="block text-xs text-muted">
              {a.ingredientName}の値上がり：{percent(a.oldRate)} → <b className="text-ng-strong">{percent(a.newRate)}</b>（目標 {percent(a.target)}）
            </span>
          </Link>
          {canEdit && (
            <button className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-muted" onClick={() => patchDoc(`organizations/${orgId}/alerts/${a.id}`, { read: true })}>
              確認した
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
