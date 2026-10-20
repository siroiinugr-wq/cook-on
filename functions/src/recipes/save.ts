// レシピの保存・版の復元・アーカイブ（変更履歴は versions/{n} に残し、消さない）
// 検索用の列（材料の逆引き・アレルゲン・原価）は必ずここで作り直すので、画面からはレシピを直接書かせない。
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { deriveRecipe, sanitizeRecipe, type RecipeInput } from "../shared/recipe";
import type { Ingredient } from "../shared/types";
import { REGION } from "../ai/config";
import { idOf, requireRole, ROLES } from "../core/auth";

export async function loadIngredientMap(orgId: string): Promise<Map<string, Ingredient>> {
  const snap = await getFirestore().collection(`organizations/${orgId}/ingredients`).get();
  return new Map(snap.docs.map((d) => [d.id, { ...(d.data() as Ingredient), id: d.id }]));
}

/** 保存の本体。既存なら今の中身を versions に写してから、版を1つ上げて上書きする */
export async function writeRecipe(orgId: string, recipeId: string | null, input: RecipeInput, uid: string, note = "") {
  const db = getFirestore();
  const col = db.collection(`organizations/${orgId}/recipes`);
  const ref = recipeId ? col.doc(recipeId) : col.doc();
  const derived = deriveRecipe(input, await loadIngredientMap(orgId));
  const version = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (recipeId && !cur.exists) throw new HttpsError("not-found", "レシピが見つかりません。");
    const prev = cur.exists ? Number(cur.data()?.version ?? 1) : 0;
    if (cur.exists) {
      tx.set(ref.collection("versions").doc(String(prev)), { ...cur.data(), archivedAt: FieldValue.serverTimestamp() });
    }
    tx.set(ref, {
      ...input,
      ...derived,
      version: prev + 1,
      archived: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
      ...(note ? { changeNote: note.slice(0, 100) } : {}),
      ...(cur.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    });
    return prev + 1;
  });
  return { recipeId: ref.id, version };
}

export const saveRecipe = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const recipeId = req.data?.recipeId ? idOf(req.data.recipeId, "レシピID") : null;
  const input = sanitizeRecipe(req.data?.recipe);
  if (typeof input === "string") throw new HttpsError("invalid-argument", input);
  return writeRecipe(orgId, recipeId, input, uid, String(req.data?.note ?? ""));
});

/** 過去の版に戻す＝その版の中身を新しい版として保存する（戻したことも履歴に残る） */
export const restoreRecipeVersion = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const recipeId = idOf(req.data?.recipeId, "レシピID");
  const version = Number(req.data?.version);
  if (!Number.isInteger(version) || version < 1) throw new HttpsError("invalid-argument", "版の番号が正しくありません。");
  const snap = await getFirestore().doc(`organizations/${orgId}/recipes/${recipeId}/versions/${version}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "その版は見つかりません。");
  const input = sanitizeRecipe(snap.data());
  if (typeof input === "string") throw new HttpsError("failed-precondition", input);
  return writeRecipe(orgId, recipeId, input, uid, `第${version}版に戻した`);
});

/** 一覧から外す（消さない。履歴も残る）。戻すときは archived=false で同じ関数を呼ぶ */
export const archiveRecipe = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const recipeId = idOf(req.data?.recipeId, "レシピID");
  await getFirestore().doc(`organizations/${orgId}/recipes/${recipeId}`).update({
    archived: req.data?.archived !== false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});
