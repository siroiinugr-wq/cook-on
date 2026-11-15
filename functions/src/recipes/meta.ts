// レシピの中身ではない情報（分類・試作の印とメモ）を直す。版は上げない（何十件まとめて分類を変えても履歴が埋まらないように）。
// レシピは画面から直接書けない（ルールで拒否）ので、ここを通す
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { REGION } from "../ai/config";
import { idOf, requireRole, ROLES } from "../core/auth";

const MAX_ROWS = 300;
const TRIAL_NOTE_MAX = 1000;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 分類と種類をまとめて直す（データの整理の「レシピの分類」から） */
export const setRecipeCategories = onCall({ region: REGION, timeoutSeconds: 120 }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const rows = (Array.isArray(req.data?.rows) ? req.data.rows : []).slice(0, MAX_ROWS) as { recipeId?: unknown; category?: unknown; subcategory?: unknown }[];
  if (!rows.length) throw new HttpsError("invalid-argument", "直すレシピがありません。");
  const db = getFirestore();
  const col = db.collection(`organizations/${orgId}/recipes`);
  let done = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const r of rows.slice(i, i + 400)) {
      const ref = col.doc(idOf(r.recipeId, "レシピID"));
      const snap = await ref.get();
      if (!snap.exists) continue;
      batch.update(ref, { category: str(r.category, 30), subcategory: str(r.subcategory, 30) });
      done++;
    }
    await batch.commit();
  }
  return { done };
});

/** 試作の印と次の改善点メモ。trial=false で試作を終える（メモは残す） */
export const setRecipeTrial = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const recipeId = idOf(req.data?.recipeId, "レシピID");
  const ref = getFirestore().doc(`organizations/${orgId}/recipes/${recipeId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "レシピが見つかりません。");
  const patch: Record<string, unknown> = { trial: req.data?.trial === true };
  if (typeof req.data?.trialNote === "string") {
    patch.trialNote = str(req.data.trialNote, TRIAL_NOTE_MAX);
    patch.trialAt = new Date().toISOString();
  }
  await ref.update(patch);
  return { ok: true };
});
