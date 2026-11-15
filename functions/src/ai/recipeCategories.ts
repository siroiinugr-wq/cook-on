// レシピの分類（分類・種類）と「自家製材料か」の案を、AIでまとめて作る（30件で1クレジット）。
// 案を返すだけで保存はしない。画面（データの整理）で人が直して setRecipeCategories で確定する
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { RECIPE_CATEGORY_BATCH, RECIPE_CATEGORY_MAX } from "../shared/credits";
import { HOMEMADE_CATEGORY } from "../shared/madeFrom";
import type { Recipe } from "../shared/types";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { RECIPE_CATEGORY_SCHEMA, RECIPE_CATEGORY_SYSTEM, type RecipeCategoryAnswer } from "./prompts";

export interface RecipeCategorySuggestion {
  recipeId: string;
  category: string;
  subcategory: string;
  component: boolean;
  confidence: number;
}

const clean = (v: unknown) => String(v ?? "").trim().slice(0, 30);

export const suggestRecipeCategories = onCall({ region: REGION, timeoutSeconds: 300, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const ids = [...new Set((Array.isArray(req.data?.recipeIds) ? req.data.recipeIds : []).map((x: unknown) => idOf(x, "レシピ")))].slice(0, RECIPE_CATEGORY_MAX) as string[];
  if (!ids.length) throw new HttpsError("invalid-argument", "レシピを選んでください。");
  const snap = await getFirestore().collection(`organizations/${orgId}/recipes`).where("archived", "==", false).get();
  const all = snap.docs.map((d) => ({ ...(d.data() as Recipe), id: d.id }));
  const want = new Set(ids);
  const list = all.filter((r) => want.has(r.id));
  if (!list.length) throw new HttpsError("not-found", "レシピが見つかりません。");
  // お店で今使っている分類・種類（案をこれに合わせてもらう）。頼んだレシピ自身の分類は除く
  const used = new Map<string, Set<string>>();
  for (const r of all) {
    if (want.has(r.id) || !r.category?.trim()) continue;
    const s = used.get(r.category.trim()) ?? new Set<string>();
    if (r.subcategory?.trim()) s.add(r.subcategory.trim());
    used.set(r.category.trim(), s);
  }
  const usedText = [...used.entries()].slice(0, 30).map(([c, s]) => `${c}（${[...s].slice(0, 12).join("・")}）`).join("\n");
  const batches: (typeof list)[] = [];
  for (let i = 0; i < list.length; i += RECIPE_CATEGORY_BATCH) batches.push(list.slice(i, i + RECIPE_CATEGORY_BATCH));

  return runWithCredits({ orgId, uid, action: "recipeCategory", units: batches.length, requestId }, async () => {
    let usage: Usage = { in: 0, out: 0 };
    let used = 0;
    const out: RecipeCategorySuggestion[] = [];
    for (const b of batches) {
      try {
        const rows = b.map((r, i) => `${i}. ${r.name}｜材料：${r.items.slice(0, 8).map((it) => it.name).join("・")}${r.category ? `｜今の分類：${r.category}${r.subcategory ? `・${r.subcategory}` : ""}` : ""}`).join("\n");
        const prompt = `${usedText ? `お店で使っている分類（種類）：\n${usedText}\n\n` : ""}レシピ：\n${rows}`;
        const r = await callGeminiJson<RecipeCategoryAnswer>({ system: RECIPE_CATEGORY_SYSTEM, prompt, schema: RECIPE_CATEGORY_SCHEMA, maxOutputTokens: 4096 });
        usage = addUsage(usage, r.usage);
        used++;
        b.forEach((rec, i) => {
          const a = r.output.r?.find((x) => x.i === i);
          if (!a) return;
          const component = a.component === true;
          const category = component ? HOMEMADE_CATEGORY : clean(a.category);
          if (!category) return;
          out.push({ recipeId: rec.id, category, subcategory: clean(a.subcategory), component, confidence: Math.max(0, Math.min(1, Number(a.c) || 0)) });
        });
      } catch (e) {
        console.warn("レシピの分類の案を作れませんでした", orgId, String((e as Error)?.message ?? e));
      }
    }
    if (!used) throw new HttpsError("internal", "AIが答えませんでした。クレジットは使われていません。");
    return { result: { suggestions: out }, usage, usedUnits: used };
  });
});
