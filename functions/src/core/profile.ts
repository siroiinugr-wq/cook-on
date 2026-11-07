// ニックネームとメールアドレスの扱い（MASAのウェブアプリ共通の決まり 2026-11-07）
// - メンバーどうしに見せるのはニックネームだけ。members/{uid} は同じ会社のメンバーが読めるので、メールアドレスは置かない
// - ニックネームは本人だけが setNickname で決める・変える（members は画面から書けないルールのまま）
// - 以前の members に残っているメールアドレスは、本人がニックネームを決めたときと、管理者が開いたとき（hideMemberEmails）に消す

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { REGION } from "../ai/config";
import { requireRole } from "./auth";
import { cleanNickname } from "../shared/nickname";

/** 自分のニックネームを決める・変える。入っている全部の店舗の members に同じ名前を書き、メールアドレスを消す */
export const setNickname = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  const r = cleanNickname((req.data as { nickname?: unknown } | undefined)?.nickname);
  if (!r.ok) throw new HttpsError("invalid-argument", r.error);
  const uid = req.auth.uid;
  const db = getFirestore();
  const mine = await db.collectionGroup("members").where("uid", "==", uid).get();
  const batch = db.batch();
  for (const m of mine.docs) {
    batch.update(m.ref, { nickname: r.name, displayName: r.name, email: FieldValue.delete(), nicknameAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  // ログインの表示名にも入れておく（次に会社に入るときの初めの名前になる）
  await getAuth().updateUser(uid, { displayName: r.name }).catch(() => undefined);
  return { nickname: r.name };
});

/** 店舗のメンバー全員の members からメールアドレスを消す（管理者だけ。画面が管理者のときに1回だけ自動で呼ぶ） */
export const hideMemberEmails = onCall({ region: REGION }, async (req) => {
  const orgId = String((req.data as { orgId?: unknown } | undefined)?.orgId ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orgId)) throw new HttpsError("invalid-argument", "店舗が正しくありません。");
  requireRole(req.auth, orgId, ["owner", "admin"]);
  const db = getFirestore();
  const all = await db.collection(`organizations/${orgId}/members`).get();
  const left = all.docs.filter((m) => "email" in (m.data() ?? {}));
  if (left.length) {
    const batch = db.batch();
    for (const m of left) batch.update(m.ref, { email: FieldValue.delete() });
    await batch.commit();
  }
  return { cleared: left.length };
});
