// 役割チェックとカスタムクレーム。クレームは { orgs: { [orgId]: role } }（1人が複数店舗に入れる）
// Admin SDK は Firestore ルールを無視するので、関数では必ずここで権限を確かめる。

import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { REGION } from "../ai/config";
import { WELCOME_CREDITS } from "../shared/credits";
import { DEFAULT_TARGET_RATE } from "../shared/cost";
import { DEFAULT_BRANDING, type Role } from "../shared/types";

const EDIT: Role[] = ["owner", "admin", "editor"];
const ADMIN: Role[] = ["owner", "admin"];
const ANY: Role[] = ["owner", "admin", "editor", "viewer"];
export const ROLES = { EDIT, ADMIN, ANY };

/** 1人が作れる店舗の数（お試しクレジット目当ての作りすぎを防ぐ） */
const MAX_OWNED_ORGS = 5;

/** パスに入れる値は英数字だけ許す（"../" などで別の場所を読ませない） */
export function idOf(v: unknown, label = "ID"): string {
  const s = String(v ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw new HttpsError("invalid-argument", `${label}の形が正しくありません。`);
  return s;
}

export function requireRole(auth: CallableRequest["auth"], orgId: string, roles: Role[]): string {
  if (!auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  const role = (auth.token.orgs as Record<string, Role> | undefined)?.[orgId];
  if (!role || !roles.includes(role)) throw new HttpsError("permission-denied", "この操作の権限がありません。");
  return auth.uid;
}

/** 費用がかかる操作・外に影響する操作は、メール確認が済んだ人だけ（Googleログインは最初から確認済み） */
export function requireVerified(auth: CallableRequest["auth"]): void {
  if (auth?.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "メールアドレスの確認がまだです。確認メールのリンクを開いてから、もう一度お試しください。");
  }
}

/** members が変わったら、その人のクレームを作り直す */
export const syncMemberClaims = onDocumentWritten(
  { document: "organizations/{orgId}/members/{uid}", region: REGION },
  async (event) => {
    const uid = event.params.uid;
    const all = await getFirestore().collectionGroup("members").where("uid", "==", uid).get();
    const orgs: Record<string, Role> = {};
    for (const m of all.docs) orgs[m.ref.parent.parent!.id] = m.data().role;
    const user = await getAuth().getUser(uid).catch(() => null);
    if (!user) return;
    await getAuth().setCustomUserClaims(uid, { ...user.customClaims, orgs });
    // 画面側は getIdToken(true) で取り直すまで古い権限のまま
  },
);

/** はじめに：店舗を作る（作った人が owner）。お試しクレジットと既定のブランドを付ける */
export const createOrganization = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  requireVerified(req.auth);
  const d = (req.data ?? {}) as { name?: unknown; targetCostRate?: unknown };
  const name = String(d.name ?? "").trim().slice(0, 40);
  if (!name) throw new HttpsError("invalid-argument", "店舗名を入力してください。");
  const rate = Number(d.targetCostRate);
  const target = rate > 0 && rate < 1 ? rate : DEFAULT_TARGET_RATE;
  const uid = req.auth.uid;

  const db = getFirestore();
  const owned = await db.collectionGroup("members").where("uid", "==", uid).where("role", "==", "owner").count().get();
  if (owned.data().count >= MAX_OWNED_ORGS) {
    throw new HttpsError("resource-exhausted", `作れる店舗は1人${MAX_OWNED_ORGS}つまでです。`);
  }

  const orgRef = db.collection("organizations").doc();
  const batch = db.batch();
  batch.set(orgRef, {
    name,
    plan: "free",
    credits: WELCOME_CREDITS,
    ownerUid: uid,
    settings: { targetCostRate: target, manufacturer: name, includeRecommendedAllergens: true },
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(orgRef.collection("members").doc(uid), {
    uid,
    role: "owner",
    email: req.auth.token.email ?? null,
    displayName: req.auth.token.name ?? null,
    joinedAt: FieldValue.serverTimestamp(),
  });
  batch.set(orgRef.collection("public").doc("branding"), { ...DEFAULT_BRANDING, appName: DEFAULT_BRANDING.appName });
  batch.set(orgRef.collection("creditLedger").doc(), {
    kind: "welcome",
    amount: WELCOME_CREDITS,
    status: "done",
    uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  // 画面がすぐ次へ進めるよう、トリガを待たずにここでもクレームを付ける（syncMemberClaims と同じ形）
  const user = await getAuth().getUser(uid);
  const orgs = { ...((user.customClaims?.orgs as Record<string, Role> | undefined) ?? {}), [orgRef.id]: "owner" as Role };
  await getAuth().setCustomUserClaims(uid, { ...user.customClaims, orgs });
  return { orgId: orgRef.id };
});
