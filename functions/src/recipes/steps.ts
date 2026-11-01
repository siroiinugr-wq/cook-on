// 工程をまとめて直す（AIなし・無料）。対象のレシピは画面で人が選ぶ。どれも前の版は履歴に残る。
// - templateId を渡す：よく使う工程の今の中身で、そこから入れた工程を置き換える（増えた工程・写真も入る）
// - stepText と photoPath を渡す：文が同じ工程に、その写真を付ける
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { sanitizeRecipe } from "../shared/recipe";
import { applyStepPhoto, applyTemplate } from "../shared/steps";
import type { StepTemplate } from "../shared/types";
import { REGION } from "../ai/config";
import { idOf, requireRole, ROLES } from "../core/auth";
import { writeRecipe } from "./save";

const MAX_RECIPES = 200;

export const syncSteps = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const recipeIds = [...new Set((Array.isArray(req.data?.recipeIds) ? req.data.recipeIds : []).map((x: unknown) => idOf(x, "レシピID")))].slice(0, MAX_RECIPES) as string[];
  if (!recipeIds.length) throw new HttpsError("invalid-argument", "反映するレシピを選んでください。");
  const db = getFirestore();

  let apply: (steps: Parameters<typeof applyTemplate>[0]) => { steps: typeof steps; changed: boolean };
  let note: string;
  if (req.data?.templateId) {
    const templateId = idOf(req.data.templateId, "よく使う工程");
    const snap = await db.doc(`organizations/${orgId}/stepTemplates/${templateId}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "よく使う工程が見つかりません。");
    const t = { ...(snap.data() as StepTemplate), id: templateId };
    apply = (steps) => applyTemplate(steps, t);
    note = `よく使う工程「${t.name}」を反映`;
  } else {
    const text = String(req.data?.stepText ?? "").trim();
    const photoPath = String(req.data?.photoPath ?? "");
    // 写真はこの店舗の場所のものだけ
    if (!text || !photoPath.startsWith(`orgs/${orgId}/recipes/`)) throw new HttpsError("invalid-argument", "工程と写真を指定してください。");
    apply = (steps) => applyStepPhoto(steps, text, photoPath);
    note = "同じ工程に写真を付けた";
  }

  let done = 0;
  const failed: { recipeId: string; reason: string }[] = [];
  for (const recipeId of recipeIds) {
    try {
      const snap = await db.doc(`organizations/${orgId}/recipes/${recipeId}`).get();
      if (!snap.exists) throw new Error("見つかりません");
      const input = sanitizeRecipe(snap.data());
      if (typeof input === "string") throw new Error(input);
      const r = apply(input.steps);
      if (!r.changed) continue;
      input.steps = r.steps;
      await writeRecipe(orgId, recipeId, input, uid, note);
      // 保存すると一覧に戻るので、しまってあったレシピはしまい直す
      if (snap.data()?.archived === true) await snap.ref.update({ archived: true });
      done++;
    } catch (e) {
      failed.push({ recipeId, reason: String((e as Error)?.message ?? e) });
    }
  }
  return { done, failed };
});
