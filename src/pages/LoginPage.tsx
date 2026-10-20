// ログイン画面：Google／メールアドレス、「初めての方はこちら」で新規登録、パスワードの再設定（AI経理と同じ流れ）
import { useState } from "react";
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { authMessage, verifyLinkSettings } from "../lib/authMessages";
import { readInvite } from "../lib/invite";
import { Icon } from "../components/common/Icon";
import { brandLogo, useBranding } from "../hooks/useBranding";

type Mode = "in" | "up" | "reset";

const RULES = [
  { label: "8文字以上", ok: (p: string) => p.length >= 8 },
  { label: "英字を含む", ok: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "数字を含む", ok: (p: string) => /[0-9]/.test(p) },
];

export function LoginPage() {
  // 自社ドメインで開かれたときは、その店舗のロゴと名前で出す（ホワイトラベル）
  const brand = useBranding(null);
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const invited = !!readInvite();

  const go = (m: Mode) => {
    setMode(m);
    setErr("");
    setInfo("");
  };

  async function withGoogle() {
    if (!auth) return;
    setErr("");
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      console.error("Google login failed", e);
      setErr(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!auth) return;
    setErr("");
    setInfo("");
    if (mode === "up") {
      if (pass !== pass2) return setErr("パスワードが一致しません。");
      if (!RULES.every((r) => r.ok(pass))) return setErr("パスワードは8文字以上で、英字と数字を含めてください。");
    }
    setBusy(true);
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        setMode("in");
        setInfo("再設定用のメールを送りました。届かない場合は迷惑メールもご確認ください。");
      } else if (mode === "up") {
        // 登録するとそのままログイン状態になり、メール確認の画面に切り替わる
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        await sendEmailVerification(cred.user, verifyLinkSettings());
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pass);
      }
    } catch (e) {
      console.error("email auth failed", e);
      setErr(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border border-line-strong bg-paper px-4 py-3";
  const canSubmit = !busy && !!email.trim() && (mode === "reset" || !!pass) && (mode !== "up" || !!pass2);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {brandLogo(brand)
            ? <img src={brandLogo(brand)!} alt="" className="h-16 w-16 rounded-2xl object-contain" />
            : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-clay text-white"><Icon name="bowl" className="h-8 w-8" /></span>}
          <h1 className="font-serif text-3xl">{brand.appName}</h1>
          <p className="text-sm text-ink-soft">
            {mode === "up" ? "メールアドレスでアカウントを作ります" : mode === "reset" ? "パスワードの再設定" : "レシピと原価、食品表示をひとつに。"}
          </p>
        </div>

        {invited && mode !== "reset" && (
          <p className="mb-3 rounded-xl bg-clay-soft p-3 text-sm text-clay-strong">
            招待を受け取っています。ログイン（はじめての方は登録）すると、参加の画面に進みます。
          </p>
        )}

        <div className="space-y-4 rounded-2xl border border-line bg-paper p-6">
          {mode !== "reset" && (
            <>
              <button onClick={withGoogle} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-paper py-3 font-medium disabled:opacity-50">
                <span className="font-bold text-clay">G</span>
                {mode === "up" ? "Googleで登録" : "Googleでログイン"}
              </button>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs text-faint">または</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" autoComplete="email" className={input} />
          {mode !== "reset" && (
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="パスワード"
              autoComplete={mode === "up" ? "new-password" : "current-password"} className={input}
              onKeyDown={(e) => e.key === "Enter" && mode === "in" && canSubmit && submit()} />
          )}
          {mode === "up" && (
            <>
              <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="パスワード（確認）" autoComplete="new-password" className={input} />
              <ul className="space-y-1 rounded-xl bg-sand p-3 text-xs text-muted">
                {RULES.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1 ${r.ok(pass) ? "text-ok" : ""}`}>
                    {r.ok(pass) ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="w-3.5 text-center">・</span>}{r.label}
                  </li>
                ))}
              </ul>
            </>
          )}

          {err && <p className="rounded-xl bg-ng/10 p-3 text-sm text-ng">{err}</p>}
          {info && <p className="rounded-xl bg-sand p-3 text-sm text-ok">{info}</p>}

          <button onClick={submit} disabled={!canSubmit} className="w-full rounded-xl bg-clay py-3 font-bold text-white disabled:bg-line-strong">
            {busy ? "処理中…" : mode === "up" ? "アカウントを作る" : mode === "reset" ? "再設定メールを送る" : "メールアドレスでログイン"}
          </button>

          <div className="flex justify-between text-sm">
            {mode === "in" ? (
              <>
                <button onClick={() => go("up")} className="font-medium text-clay-strong underline">初めての方はこちら</button>
                <button onClick={() => go("reset")} className="text-muted underline">パスワードを忘れた</button>
              </>
            ) : (
              <button onClick={() => go("in")} className="text-muted underline">ログイン画面に戻る</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
