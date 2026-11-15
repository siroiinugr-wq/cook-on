// 試作の印と「次の改善点」のメモ。レシピの中身とは別に持つので、書いても版は上がらない（setRecipeTrial）。
// 試作のレシピは一覧の「試作」でまとめて見られる。試作を終えてもメモは残る
import { useEffect, useState } from "react";
import type { Recipe } from "@shared/types";
import { call } from "../../lib/store";
import { ui } from "../common/ui";

export function TrialCard({ orgId, recipe, canEdit }: { orgId: string; recipe: Recipe; canEdit: boolean }) {
  const [note, setNote] = useState(recipe.trialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // ほかの端末で書いたメモが届いたら入れ直す（自分が打っている途中は上書きしない）
  const [base, setBase] = useState(recipe.trialNote ?? "");
  useEffect(() => {
    const next = recipe.trialNote ?? "";
    if (next !== base) {
      setNote((cur) => (cur === base ? next : cur));
      setBase(next);
    }
  }, [recipe.trialNote, base]);

  async function send(p: { trial: boolean; trialNote?: string }, done: string) {
    setBusy(true);
    setMsg("");
    try {
      await call("setRecipeTrial", { orgId, recipeId: recipe.id, ...p });
      setMsg(done);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (!recipe.trial) {
    return (
      <section className={`${ui.card} space-y-2 text-sm`}>
        <p className="font-bold">試作中のレシピですか？</p>
        <p className="text-xs text-muted">印を付けると、一覧の「試作」にまとまり、次に直したいこと（甘さ・焼き時間など）をメモできます。</p>
        {recipe.trialNote && <p className="whitespace-pre-wrap rounded-xl bg-sand p-2 text-xs text-ink-soft">前の試作のメモ：{recipe.trialNote}</p>}
        <button disabled={busy} className={`w-full ${ui.secondary}`} onClick={() => send({ trial: true }, "")}>試作の印を付ける</button>
        {msg && <p className="text-xs text-ng">{msg}</p>}
      </section>
    );
  }

  const dirty = note.trim() !== (recipe.trialNote ?? "").trim();
  const at = recipe.trialAt ? new Date(recipe.trialAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "";
  return (
    <section className="space-y-2 rounded-2xl border border-warn bg-warn-soft/40 p-4 text-sm">
      <div className="flex items-baseline gap-2">
        <p className="font-bold text-warn-strong">試作中・次の改善点</p>
        {at && <span className="text-xs text-muted">{at}に書いたメモ</span>}
      </div>
      {canEdit ? (
        <>
          <textarea className={`${ui.input} h-24`} value={note} maxLength={1000} placeholder="例：甘さを控えめに（砂糖−10g）、焼き時間を2分のばす、型を18cmに"
            onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy || !dirty} className={`flex-1 ${ui.primary}`} onClick={() => send({ trial: true, trialNote: note }, "メモを保存しました。")}>メモを保存</button>
            <button disabled={busy} className={`flex-1 ${ui.secondary}`} onClick={() => send({ trial: false, ...(dirty ? { trialNote: note } : {}) }, "試作を終えました。メモは残っています。")}>試作を終える</button>
          </div>
          <p className="text-[11px] text-muted">分量を直すときは「編集」から。前の版は履歴に残るので、試作ごとの違いをあとで見比べられます。</p>
        </>
      ) : <p className="whitespace-pre-wrap">{recipe.trialNote || "メモはまだありません。"}</p>}
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </section>
  );
}
