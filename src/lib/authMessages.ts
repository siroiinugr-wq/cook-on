// Firebase Authentication のエラーを、画面に出せる日本語にする
import type { ActionCodeSettings } from "firebase/auth";
import { readInvite } from "./invite";

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "メールアドレスの形式が正しくありません。",
  "auth/user-not-found": "このメールアドレスは登録されていません。",
  "auth/wrong-password": "パスワードが違います。",
  "auth/invalid-credential": "メールアドレスかパスワードが違います。",
  "auth/email-already-in-use": "このメールアドレスはすでに登録されています。ログインしてください。",
  "auth/weak-password": "パスワードは8文字以上で、英字と数字を含めてください。",
  "auth/too-many-requests": "試行が続いたため一時的に制限されています。しばらくお待ちください。",
  "auth/popup-closed-by-user": "ログインが中断されました。",
  "auth/cancelled-popup-request": "ログインが中断されました。",
  "auth/popup-blocked": "ログイン用の小さな画面がブロックされました。ブラウザのポップアップを許可してから、もう一度お試しください。",
  "auth/network-request-failed": "通信に失敗しました。接続をご確認ください。",
  "auth/unauthorized-domain": "このアドレスはログインの許可リストに入っていません（Firebaseの「承認済みドメイン」に追加が必要です）。",
  "auth/operation-not-allowed": "このログイン方法はまだ有効になっていません（Firebaseの「Sign-in method」で有効にしてください）。",
  "auth/account-exists-with-different-credential": "このメールアドレスは別の方法で登録されています。最初に使った方法でログインしてください。",
};

export function authMessage(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? "");
  return MESSAGES[code] ?? `うまくいきませんでした。もう一度お試しください。（${code || "unknown"}）`;
}

/**
 * 確認メールのリンクを開いたあとに戻ってくる先。
 * 招待の途中なら、そのまま参加画面に戻れるよう招待のページにする（AI経理・ig-saas と同じ考え方）
 */
export function verifyLinkSettings(): ActionCodeSettings {
  const pend = readInvite();
  return { url: `${window.location.origin}${pend ? `/invite/${pend}` : "/"}` };
}
