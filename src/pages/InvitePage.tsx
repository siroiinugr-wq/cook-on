// 招待リンク（/invite/店舗ID/合言葉）を開いたときの画面。AI経理の InvitePage と同じ流れ
// ログイン前 → 店舗名を見せて「すすむ」でログイン画面へ（招待は覚えておく）
// ログイン後 → 「参加する」で店舗に入る。メールで登録した人は確認メールを開いてから
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { acceptInvite, clearInvite, keepInvite, peekInvite } from "../lib/invite";
import { errorText } from "../lib/store";
import { ROLE_HELP, ROLE_LABEL, type InviteRole } from "@shared/roles";
import type { Role, Session } from "../hooks/useSession";
import { Icon } from "../components/common/Icon";
import { LoginPage } from "./LoginPage";
import { VerifyEmailPage } from "./VerifyEmailPage";

// onJoined：参加した店舗を「いま開いている店舗」にする
export function InvitePage({ session, onJoined }: { session: Session; onJoined: (orgId: string) => void }) {
  const { orgId = "", token = "" } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ orgName: string; role: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toLogin, setToLogin] = useState(false);
  const user = session.user;
  const already = orgId in session.orgs;

  useEffect(() => {
    if (already) return clearInvite();
    peekInvite(orgId, token).then(setInfo).catch((e) => {
      // 使えない招待は忘れる。覚えたままだとログインのたびにここへ戻ってくる
      clearInvite();
      setErr(errorText(e));
    });
  }, [orgId, token, already]);

  // メール確認の途中で画面を離れても、戻ってきたらここに続けられるよう覚えておく
  useEffect(() => {
    if (user?.needsVerify) keepInvite(orgId, token);
  }, [user?.needsVerify, orgId, token]);

  // ログイン・登録・メール確認のあいだは、それぞれの画面を出す（招待は覚えたまま）
  if (!user && toLogin) return <LoginPage />;
  if (user?.needsVerify) return <VerifyEmailPage email={user.email} />;

  async function join() {
    setBusy(true);
    setErr("");
    try {
      await acceptInvite(orgId, token);
      clearInvite();
      onJoined(orgId);
      await auth?.currentUser?.getIdToken(true); // 新しい店舗の権限を読み直す
      nav("/", { replace: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const primary = "w-full rounded-xl bg-clay py-3 font-bold text-white disabled:bg-line-strong";
  const secondary = "w-full rounded-xl border border-line-strong py-3 text-ink-soft";

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-paper p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-soft text-clay"><Icon name="users" className="h-7 w-7" /></span>
        <p className="text-xs tracking-wide text-faint">COOK ON へのご招待</p>

        {already ? (
          <>
            <p className="text-ink-soft">すでにこの店舗のメンバーです。</p>
            <button onClick={() => { onJoined(orgId); nav("/", { replace: true }); }} className={primary}>はじめる</button>
          </>
        ) : err ? (
          <>
            <p className="text-sm leading-relaxed text-ng">{err}</p>
            <button onClick={() => nav("/", { replace: true })} className={secondary}>{user ? "トップへ" : "ログイン画面へ"}</button>
          </>
        ) : !info ? (
          <p className="text-sm text-muted">招待を確認しています…</p>
        ) : (
          <>
            <h1 className="font-serif text-xl">{info.orgName} に招待されています</h1>
            <p className="text-sm text-ink-soft">
              「{ROLE_LABEL[info.role as Role] ?? info.role}」として参加します。<br />
              <span className="text-muted">{ROLE_HELP[info.role as InviteRole] ?? ""}</span>
            </p>
            {user ? (
              <>
                <p className="rounded-xl bg-sand p-3 text-sm text-ink-soft">{user.email} で参加します</p>
                <button onClick={join} disabled={busy} className={primary}>{busy ? "参加しています…" : "参加する"}</button>
                <button onClick={async () => { keepInvite(orgId, token); if (auth) await signOut(auth); setToLogin(true); }} className={secondary}>
                  別のアカウントで参加する
                </button>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted">参加するにはログインが必要です。はじめての方は、次の画面の「初めての方はこちら」から登録できます。</p>
                <button onClick={() => { keepInvite(orgId, token); setToLogin(true); }} className={primary}>すすむ</button>
              </>
            )}
            <button onClick={() => { clearInvite(); nav("/", { replace: true }); }} className="text-sm text-muted underline">参加しない</button>
          </>
        )}
      </div>
    </div>
  );
}
