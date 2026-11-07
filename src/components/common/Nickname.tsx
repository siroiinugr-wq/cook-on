// ニックネームを決める・変える（MASAのウェブアプリ共通の決まり 2026-11-07）
// NicknameGate：ニックネームがまだの人（新しく登録した人・以前から使っている人）は、入る前に1回だけ決めてもらう
// NicknameForm：設定の「ニックネーム」で変える欄
import { useEffect, useState, type ReactNode } from "react";
import { NICKNAME_MAX } from "@shared/nickname";
import { hideOldEmailsOnce, saveNickname, useMyNickname } from "../../lib/profile";

export function NicknameForm({ initial, submitLabel = "保存する", onSaved }: { initial: string; submitLabel?: string; onSaved?: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setName(initial), [initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const saved = await saveNickname(name);
      setMsg({ ok: true, text: "保存しました。" });
      onSaved?.(saved);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "保存できませんでした。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NICKNAME_MAX} placeholder="例：やまちゃん"
        autoComplete="nickname" required className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2.5" />
      <p className="text-xs text-muted">メンバーの一覧などに出る名前です（{NICKNAME_MAX}文字まで）。メールアドレスはほかの人には見えません。</p>
      <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-xl bg-clay py-3 font-bold text-white disabled:opacity-50">
        {busy ? "保存中…" : submitLabel}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-ng"}`}>{msg.text}</p>}
    </form>
  );
}

/** ニックネームが決まるまで、中身の代わりに「はじめに、ニックネームを決めてください」を出す */
export function NicknameGate({ orgId, uid, isAdmin, children }: { orgId: string; uid: string; isAdmin: boolean; children: ReactNode }) {
  const me = useMyNickname(orgId, uid);
  useEffect(() => {
    if (isAdmin) hideOldEmailsOnce(orgId);
  }, [orgId, isAdmin]);

  if (me.loading) return <p className="p-10 text-center text-muted">読み込み中…</p>;
  if (me.nickname || me.failed) return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center bg-cream p-6">
      <h1 className="font-serif text-xl">はじめに、ニックネームを決めてください</h1>
      <p className="mb-4 mt-1 text-sm text-muted">あとから設定の「ニックネーム」で変えられます。</p>
      <NicknameForm initial={me.suggest} submitLabel="この名前ではじめる" />
    </div>
  );
}
