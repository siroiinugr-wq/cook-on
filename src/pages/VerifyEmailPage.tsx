// メールアドレスで登録した人が、確認メールのリンクを開くまで待つ画面（Googleログインの人は通らない）
import { useEffect, useState } from "react";
import { sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { authMessage, verifyLinkSettings } from "../lib/authMessages";
import { Icon } from "../components/common/Icon";

export function VerifyEmailPage({ email }: { email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 確認メールのリンクからこの画面に戻ってきたときは、押さなくても確認済みを読み直す
  useEffect(() => {
    const u = auth?.currentUser;
    u?.reload().then(async () => {
      if (u.emailVerified) await u.getIdToken(true);
    }).catch(() => undefined);
  }, []);

  async function resend() {
    if (!auth?.currentUser) return;
    setBusy(true);
    setMsg(null);
    try {
      await sendEmailVerification(auth.currentUser, verifyLinkSettings());
      setMsg({ ok: true, text: "確認メールをもう一度送りました。" });
    } catch (e) {
      setMsg({ ok: false, text: authMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  // 別のタブでリンクを開いたあと、この画面で押す。ユーザー情報を取り直すと確認済みになっている
  async function done() {
    const u = auth?.currentUser;
    if (!u) return;
    setBusy(true);
    setMsg(null);
    await u.reload();
    if (u.emailVerified) {
      await u.getIdToken(true); // 画面（useSession）が切り替わる
    } else {
      setMsg({ ok: false, text: "まだ確認が済んでいないようです。メールのリンクを開いてから押してください。" });
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-paper p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-soft text-clay"><Icon name="mail" className="h-7 w-7" /></span>
        <h1 className="font-serif text-xl">確認メールを送りました</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">{email}</span> に届いたメールのリンクを開いてください。
          開いたら、下の「確認しました」を押すと次へ進みます。
        </p>
        <p className="text-xs text-muted">届かないときは、迷惑メールのフォルダもご確認ください。</p>
        {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-ng"}`}>{msg.text}</p>}
        <button onClick={done} disabled={busy} className="w-full rounded-xl bg-clay py-3 font-bold text-white disabled:bg-line-strong">確認しました</button>
        <button onClick={resend} disabled={busy} className="w-full rounded-xl border border-line-strong py-3 text-ink-soft disabled:opacity-50">確認メールを再送する</button>
        <button onClick={() => auth && signOut(auth)} className="text-sm text-muted underline">別のアカウントでログインする</button>
      </div>
    </div>
  );
}
