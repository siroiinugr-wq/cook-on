// 招待リンクまわり（AI経理・ig-saas の lib/invite.ts と同じ考え方）
// 招待を開いた人がログイン・新規登録・メール確認で画面を離れても、戻ってきたら参加画面に続けられるよう覚えておく
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, isDemo } from "./firebase";

const KEY = "cookon-pendingInvite";
const HOURS = 24; // 覚えておく時間

/** 参加の途中であることを覚える（タブをまたいでも残るよう localStorage） */
export function keepInvite(orgId: string, token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ path: `${orgId}/${token}`, at: Date.now() }));
  } catch {
    // 保存できなくても、その場での参加はできる
  }
}

/** 覚えている招待（"会社ID/合言葉"）。古いものは捨てる。無ければ空 */
export function readInvite(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return "";
    const d = JSON.parse(raw) as { path?: string; at?: number };
    if (Date.now() - Number(d.at ?? 0) > HOURS * 3600000) {
      localStorage.removeItem(KEY);
      return "";
    }
    return String(d.path ?? "");
  } catch {
    return "";
  }
}

/** 参加が済んだ・やめたので忘れる */
export function clearInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても期限で消える
  }
}

export const inviteUrl = (orgId: string, token: string) => `${window.location.origin}/invite/${orgId}/${token}`;

const call = async <T = unknown>(name: string, data: object): Promise<T> => {
  if (isDemo || !functions) throw new Error("デモモードでは招待を使えません。");
  return (await httpsCallable(functions, name)(data)).data as T;
};

export const peekInvite = (orgId: string, token: string) => call<{ orgName: string; role: string }>("peekInvite", { orgId, token });
export const acceptInvite = (orgId: string, token: string) => call<{ orgId: string; role: string }>("acceptInvite", { orgId, token });
export const createInvite = (orgId: string, role: string, label: string) =>
  call<{ token: string; expiresAt: number }>("createInvite", { orgId, role, label });
export const revokeInvite = (orgId: string, token: string) => call("revokeInvite", { orgId, token });

export interface PendingInvite { token: string; role: string; label: string; expiresAt: number }
export interface Member { uid: string; role: string; email: string | null; displayName: string | null }

/** まだ使われていない招待（管理者だけ読める） */
export function subscribeInvites(orgId: string, cb: (list: PendingInvite[]) => void): () => void {
  if (isDemo || !db) {
    cb([]);
    return () => undefined;
  }
  const q = query(collection(db, `organizations/${orgId}/invites`), where("usedBy", "==", null));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({
    token: d.id,
    role: String(d.data().role ?? ""),
    label: String(d.data().label ?? ""),
    expiresAt: d.data().expiresAt?.toMillis?.() ?? 0,
  })).filter((i) => i.expiresAt > Date.now())), () => cb([]));
}

export function subscribeMembers(orgId: string, cb: (list: Member[]) => void): () => void {
  if (isDemo || !db) {
    cb([{ uid: "demo-user", role: "owner", email: "demo@example.com", displayName: null }]);
    return () => undefined;
  }
  return onSnapshot(collection(db, `organizations/${orgId}/members`),
    (s) => cb(s.docs.map((d) => ({ uid: d.id, role: String(d.data().role ?? ""), email: d.data().email ?? null, displayName: d.data().displayName ?? null }))),
    () => cb([]));
}
