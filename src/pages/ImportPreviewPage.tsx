// 取り込みのプレビュー：読み取った結果を確かめ、材料の結びつきを直してから保存する（保存前は何も変わらない）
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { matchLevel, type ImportDoc, type ParsedRecipe } from "@shared/importTypes";
import { useOrgCtx } from "../contexts/OrgContext";
import { useDoc } from "../hooks/useData";
import { call } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { ui } from "../components/common/ui";
import { ImportRecipeCard } from "../components/import/ImportRecipeCard";

export function ImportPreviewPage() {
  const { importId } = useParams();
  const { orgId, canEdit } = useOrgCtx();
  const { data, loading } = useDoc<ImportDoc>(`organizations/${orgId}/imports/${importId}`);
  const [recipes, setRecipes] = useState<ParsedRecipe[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    if (data && !recipes) setRecipes(data.recipes ?? []);
  }, [data, recipes]);

  if (loading || (data && !recipes)) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  if (!data || !recipes) return <p className="py-10 text-center">取り込みが見つかりません。<Link to="/import" className="underline">戻る</Link></p>;

  const saved = data.status === "saved";
  const readOnly = saved || !canEdit || data.status === "saving";
  const active = recipes.filter((r) => !r.skip);
  const items = active.flatMap((r) => r.items);
  const count = { ok: 0, check: 0, new: 0 };
  items.forEach((it) => count[matchLevel(it.match)]++);

  async function commit() {
    setBusy(true);
    setErr("");
    try {
      await call("commitImport", { orgId, importId, recipes });
      nav("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHead title="取り込みの確認" back="/import" />
      <p className="text-sm text-muted">{data.fileName || "貼り付け"}・{recipes.length}件のレシピを読み取りました</p>
      {data.failedChunks?.length > 0 && (
        <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn-strong">
          {data.photos
            ? `${data.failedChunks.map((n) => n + 1).join("・")}枚目の写真が読み取れませんでした。その分のクレジットは使われていません。足りないレシピは、その写真だけ撮り直して読み取ってください。`
            : `一部（${data.failedChunks.length}か所）が読み取れませんでした。その分のクレジットは使われていません。足りないレシピは、その部分だけ貼り付けてもう一度読み取ってください。`}
        </p>
      )}
      {saved ? (
        <p className="rounded-xl bg-ok-soft p-3 text-sm text-ok-strong">保存済みです（{data.savedRecipeIds?.length ?? 0}件）。<Link to="/" className="underline">レシピの一覧へ</Link></p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-ok-soft p-2 text-ok-strong"><b className="block text-lg">{count.ok}</b>一致</div>
          <div className="rounded-xl bg-warn-soft p-2 text-warn-strong"><b className="block text-lg">{count.check}</b>確かめて</div>
          <div className="rounded-xl bg-sand p-2 text-muted"><b className="block text-lg">{count.new}</b>新しく作る</div>
        </div>
      )}
      {!saved && <p className="text-xs text-muted">黄色の行は、右の欄で正しい材料を選び直せます。チェックを外したレシピは取り込みません。新しく作る材料は、あとで仕入れ値を入れてください。</p>}
      <div className="space-y-2">
        {recipes.map((r, i) => (
          <ImportRecipeCard key={i} r={r} readOnly={readOnly} set={(nr) => setRecipes(recipes.map((x, j) => (j === i ? nr : x)))} />
        ))}
      </div>
      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <p className="flex-1 text-sm">{active.length}件を保存します{err && <span className="block text-ng">{err}</span>}</p>
            <button disabled={busy || !active.length} onClick={commit} className={ui.primary}>{busy ? "保存しています…" : "この内容で保存"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
