// 変更履歴。保存するたびに前の版が残る。「この版に戻す」も新しい版として保存される（戻したことも履歴に残る）
import { useState, type ReactNode } from "react";
import { yen } from "@shared/cost";
import type { Recipe } from "@shared/types";
import { useCol } from "../../hooks/useData";
import { call, toDate } from "../../lib/store";
import { useConfirm } from "../common/ConfirmDialog";

type Version = Recipe & { changeNote?: string };
const fmt = (v: unknown) => toDate(v)?.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) ?? "";

export function VersionHistory({ orgId, recipe, canEdit }: { orgId: string; recipe: Recipe & { changeNote?: string }; canEdit: boolean }) {
  const { list, loading } = useCol<Version>(`organizations/${orgId}/recipes/${recipe.id}/versions`);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  const sorted = [...list].sort((a, b) => Number(b.id) - Number(a.id));

  async function restore(v: Version) {
    const ok = await confirm({ title: `第${v.id}版に戻しますか？`, body: "いまの内容も履歴に残るので、あとから元に戻せます。", ok: "この版に戻す" });
    if (!ok) return;
    setBusy(v.id);
    setErr("");
    try {
      await call("restoreRecipeVersion", { orgId, recipeId: recipe.id, version: Number(v.id) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (loading) return <p className="text-sm text-muted">読み込み中…</p>;
  return (
    <div className="space-y-2">
      <Row label={`第${recipe.version}版（いまの内容）`} sub={`${fmt(recipe.updatedAt)} ${recipe.changeNote ?? ""}`} cost={recipe.costCache?.perPiece} />
      {!sorted.length && <p className="text-sm text-muted">まだ前の版はありません。保存し直すと、ここに残ります。</p>}
      {sorted.map((v) => (
        <Row key={v.id} label={`第${v.id}版`} sub={`${fmt(v.updatedAt)} ${v.changeNote ?? ""}`} cost={v.costCache?.perPiece}
          action={canEdit && <button disabled={!!busy} onClick={() => restore(v)} className="rounded-lg border border-line-strong px-2 py-1 text-xs disabled:opacity-50">{busy === v.id ? "戻しています…" : "この版に戻す"}</button>} />
      ))}
      {err && <p className="text-sm text-ng">{err}</p>}
    </div>
  );
}

function Row({ label, sub, cost, action }: { label: string; sub: string; cost?: number; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-sand px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="truncate text-xs text-muted">{sub}　1個 {yen(cost)}</p>
      </div>
      {action}
    </div>
  );
}
