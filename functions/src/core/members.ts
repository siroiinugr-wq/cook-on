// メンバーの役割と「AIを使う」の切り替え（オーナー・管理者だけ）。members は画面から書けないので、この関数だけが直す。
// 役割を変えると syncMemberClaims（core/auth.ts）がその人のクレームを作り直す。
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { REGION } from "../ai/config";
import { idOf, requireRole, ROLES } from "./auth";
import { canSeeMoney, INVITE_ROLES, type InviteRole } from "../shared/roles";
import type { Role } from "../shared/types";
import { ensureStaffViews, rebuildStaffViews } from "../staff/mirror";

export const updateMember = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const me = requireRole(req.auth, orgId, ROLES.ADMIN);
  const uid = idOf(req.data?.uid, "メンバー");
  const ref = getFirestore().doc(`organizations/${orgId}/members/${uid}`);
  const cur = (await ref.get()).data();
  if (!cur) throw new HttpsError("not-found", "メンバーが見つかりません。");
  if (cur.role === "owner") throw new HttpsError("permission-denied", "オーナーの役割は変えられません。");

  const patch: Record<string, unknown> = { accessUpdatedAt: FieldValue.serverTimestamp(), accessUpdatedBy: me };
  if (req.data?.role !== undefined) {
    const role = String(req.data.role) as InviteRole;
    if (!INVITE_ROLES.includes(role)) throw new HttpsError("invalid-argument", "選べない役割です。");
    if (uid === me) throw new HttpsError("permission-denied", "自分の役割は変えられません。ほかの管理者に頼んでください。");
    patch.role = role;
  }
  if (req.data?.ai !== undefined) patch.ai = req.data.ai === true;
  await ref.update(patch);
  // 値段を見られない役割にしたら、スタッフ用の写しがあるか確かめる
  if (!canSeeMoney((patch.role ?? cur.role) as Role)) await ensureStaffViews(orgId);
  return { ok: true };
});

/** スタッフ用の写し（値段を抜いたレシピと材料）を作り直す。はじめて公開したときに管理者の画面が1回だけ呼ぶ */
export const syncStaffViews = onCall({ region: REGION, timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.ADMIN);
  return rebuildStaffViews(orgId);
});
