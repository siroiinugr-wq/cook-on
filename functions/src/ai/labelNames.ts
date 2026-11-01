// ラベル（一括表示）に出す原材料名の案を、AIでまとめて作る（20件で1クレジット）。
// 案を返すだけで保存はしない。画面（データの整理）で人が直して確定する
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { LABEL_NAME_BATCH, LABEL_NAME_MAX } from "../shared/credits";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { LABEL_NAME_SCHEMA, LABEL_NAME_SYSTEM, type LabelNameAnswer } from "./prompts";
import { loadIngredientMap } from "../recipes/save";

export interface LabelNameSuggestion {
  ingredientId: string;
  label: string;
  additive: boolean;
  confidence: number;
}

export const suggestLabelNames = onCall({ region: REGION, timeoutSeconds: 300, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const ids = [...new Set((Array.isArray(req.data?.ingredientIds) ? req.data.ingredientIds : []).map((x: unknown) => idOf(x, "材料")))].slice(0, LABEL_NAME_MAX) as string[];
  if (!ids.length) throw new HttpsError("invalid-argument", "材料を選んでください。");
  const ingById = await loadIngredientMap(orgId);
  const list = ids.map((id) => ingById.get(id)).filter((x) => !!x);
  if (!list.length) throw new HttpsError("not-found", "材料が見つかりません。");
  const batches: (typeof list)[] = [];
  for (let i = 0; i < list.length; i += LABEL_NAME_BATCH) batches.push(list.slice(i, i + LABEL_NAME_BATCH));

  return runWithCredits({ orgId, uid, action: "labelName", units: batches.length, requestId }, async () => {
    let usage: Usage = { in: 0, out: 0 };
    let used = 0;
    const out: LabelNameSuggestion[] = [];
    for (const b of batches) {
      try {
        const prompt = b.map((ing, i) => `${i}. ${ing.name}${ing.aliases?.length ? `（別名：${ing.aliases.slice(0, 3).join("・")}）` : ""}`).join("\n");
        const r = await callGeminiJson<LabelNameAnswer>({ system: LABEL_NAME_SYSTEM, prompt, schema: LABEL_NAME_SCHEMA, maxOutputTokens: 2048 });
        usage = addUsage(usage, r.usage);
        used++;
        b.forEach((ing, i) => {
          const a = r.output.r?.find((x) => x.i === i);
          const label = String(a?.label ?? "").trim().slice(0, 300);
          if (!label) return;
          out.push({ ingredientId: ing.id, label, additive: a?.additive === true, confidence: Math.max(0, Math.min(1, Number(a?.c) || 0)) });
        });
      } catch (e) {
        console.warn("ラベルの名前の案を作れませんでした", orgId, String((e as Error)?.message ?? e));
      }
    }
    if (!used) throw new HttpsError("internal", "AIが答えませんでした。クレジットは使われていません。");
    return { result: { suggestions: out }, usage, usedUnits: used };
  });
});
