// ニックネーム（MASAのウェブアプリ共通の決まり 2026-11-07）
// メンバーどうしに見せるのはニックネームだけ。メールアドレスはほかの人に見せない（一覧にも、読めるデータにも置かない）。
// 画面（登録・マイページ）とサーバー（setNickname）が同じ判定を使う。

export const NICKNAME_MAX = 20;

export type NicknameCheck = { ok: true; name: string } | { ok: false; error: string };

/** 前後の空白を取り、続く空白を1つにして確かめる。メールアドレスは名前に使えない */
export function cleanNickname(raw: unknown): NicknameCheck {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "ニックネームを入れてください。" };
  if ([...name].length > NICKNAME_MAX) return { ok: false, error: `ニックネームは${NICKNAME_MAX}文字までです。` };
  if (/[@＠]/.test(name)) return { ok: false, error: "メールアドレスはニックネームに使えません。" };
  return { ok: true, name };
}

/** 一覧などに出す名前。ニックネーム → 以前の表示名（メールの形でなければ）→「名前未設定」。メールアドレスは出さない */
export function memberLabel(m: { nickname?: string | null; displayName?: string | null }): string {
  const nick = String(m.nickname ?? "").trim();
  if (nick) return nick;
  const old = String(m.displayName ?? "").trim();
  if (old && !/[@＠]/.test(old)) return old;
  return "名前未設定";
}

/** ニックネームの初めの案（Google の名前など）。メールの形なら空にする */
export function suggestNickname(raw: unknown): string {
  const s = String(raw ?? "").trim();
  return s && !/[@＠]/.test(s) ? [...s].slice(0, NICKNAME_MAX).join("") : "";
}
