// 招待リンクで店舗にスタッフを加える（AI経理・ig-saas の招待と同じ流れ）
// 管理者がリンクを作る → 相手がリンクを開く → ログイン/新規登録 → 「参加する」で members に入る
// members を書くと syncMemberClaims がクレームを作り直すが、待たずにここでも付ける

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { REGION } from "../ai/config";
import { requireRole } from "./auth";
import type { Role } from "../shared/types";
import { INVITE_EXPIRE_DAYS, INVITE_ROLES, type InviteRole } from "../shared/roles";

/** ドキュメントのパスに入れる値は英数字だけ許す（"../" などで別の場所を読ませない） */
function ids(data: unknown): { orgId: string; token: string } {
  const d = (data ?? {}) as { orgId?: unknown; token?: unknown };
  const orgId = String(d.orgId ?? "");
  const token = String(d.token ?? "");
  if (!/^[A-Za-z0-9]{1,64}$/.test(orgId) || !/^[a-f0-9]{32}$/.test(token)) {
    throw new HttpsError("invalid-argument", "招待リンクの形が正しくありません。");
  }
  return { orgId, token };
}

/** 使える招待かどうか。使えなければ理由をそのまま画面に出す */
function checkUsable(d: FirebaseFirestore.DocumentData | undefined): asserts d {
  if (!d) throw new HttpsError("not-found", "この招待は見つかりません。取り消された可能性があります。");
  if (d.usedBy) throw new HttpsError("failed-precondition", "この招待はすでに使われています。管理者に新しいリンクをお願いしてください。");
  const exp = (d.expiresAt as Timestamp | undefined)?.toMillis();
  if (exp && exp < Date.now()) throw new HttpsError("failed-precondition", "この招待は期限切れです。管理者に新しいリンクをお願いしてください。");
}

/** 招待リンクを作る（管理者だけ） */
export const createInvite = onCall({ region: REGION }, async (req) => {
  const orgId = String(req.data?.orgId ?? "");
  requireRole(req.auth, orgId, ["owner", "admin"]);
  const role = String(req.data?.role ?? "") as InviteRole;
  if (!INVITE_ROLES.includes(role)) throw new HttpsError("invalid-argument", "選べない役割です。");
  const label = String(req.data?.label ?? "").trim().slice(0, 40);

  const token = randomBytes(16).toString("hex");
  const expires = new Date(Date.now() + INVITE_EXPIRE_DAYS * 86400000);
  await getFirestore().doc(`organizations/${orgId}/invites/${token}`).set({
    role,
    label,
    createdBy: req.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expires),
    usedBy: null,
  });
  return { token, expiresAt: expires.getTime() };
});

/** まだ使われていない招待を取り消す（管理者だけ） */
export const revokeInvite = onCall({ region: REGION }, async (req) => {
  const { orgId, token } = ids(req.data);
  requireRole(req.auth, orgId, ["owner", "admin"]);
  const ref = getFirestore().doc(`organizations/${orgId}/invites/${token}`);
  const d = (await ref.get()).data();
  if (d?.usedBy) throw new HttpsError("failed-precondition", "使用済みの招待は取り消せません。");
  await ref.delete();
  return { ok: true };
});

/** 招待の中身を、参加前に確かめる（ログイン前でも呼べる。店舗名と役割だけ返す） */
export const peekInvite = onCall({ region: REGION }, async (req) => {
  const { orgId, token } = ids(req.data);
  const db = getFirestore();
  const d = (await db.doc(`organizations/${orgId}/invites/${token}`).get()).data();
  checkUsable(d);
  const org = (await db.doc(`organizations/${orgId}`).get()).data() ?? {};
  return { orgName: String(org.name ?? ""), role: String(d.role) };
});

/** 招待を受けて店舗に参加する。1人が複数の店舗に入れるので、他社に所属していても参加できる */
export const acceptInvite = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  // Googleログインは最初から確認済み。メールで登録した人は確認メールのリンクを開いてから
  if (req.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "メールアドレスの確認がまだです。確認メールのリンクを開いてから、もう一度お試しください。");
  }
  const { orgId, token } = ids(req.data);
  const uid = req.auth.uid;
  const db = getFirestore();
  const inviteRef = db.doc(`organizations/${orgId}/invites/${token}`);
  const memberRef = db.doc(`organizations/${orgId}/members/${uid}`);

  // 同じリンクを2人が同時に使っても、片方だけが参加できるようにトランザクションで行う
  const role = await db.runTransaction(async (tx) => {
    const [inv, mem] = await Promise.all([tx.get(inviteRef), tx.get(memberRef)]);
    if (mem.exists) throw new HttpsError("already-exists", "すでにこの店舗のメンバーです。");
    const d = inv.data();
    checkUsable(d);
    tx.set(memberRef, {
      uid,
      role: d.role,
      email: req.auth!.token.email ?? null,
      displayName: req.auth!.token.name ?? null,
      invitedBy: d.createdBy ?? null,
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() });
    return d.role as Role;
  });

  // 画面がすぐ切り替わるよう、トリガを待たずにクレームを付ける（createOrganization と同じ形）
  const user = await getAuth().getUser(uid);
  const orgs = { ...((user.customClaims?.orgs as Record<string, Role> | undefined) ?? {}), [orgId]: role };
  await getAuth().setCustomUserClaims(uid, { ...user.customClaims, orgs });
  return { orgId, role };
});
