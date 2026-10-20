// 原価高騰アラート（設計書 ①）。AIは使わないので無料。
// 材料の仕入れ値・アレルゲンが変わったら、その材料を使うレシピの原価とアレルゲンを計算し直す。
// 原価率が目標を超えたら（前は超えていなかったら）alerts に書く。値上がりは priceHistory に残す。
// 包装資材・包装セットを直したときも同じ計算し直しを使う（recipes/packagingAlert.ts）
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { DEFAULT_TARGET_RATE } from "../shared/cost";
import { deriveRecipe, sanitizeRecipe } from "../shared/recipe";
import type { CostCache, Ingredient } from "../shared/types";
import { REGION } from "../ai/config";
import { loadIngredientMap, loadPackaging } from "./save";

const WATCH: (keyof Ingredient)[] = ["purchasePrice", "purchaseQty", "purchaseUnit", "gramsPerPiece", "gramsPerMl", "allergens"];

/**
 * 変わったもの（材料・包装資材・包装セット）を使うレシピの原価・アレルゲン・包装の列を計算し直し、
 * 目標の原価率を初めて超えたレシピは alerts に書く。cause はお知らせに出す「何が変わったか」
 */
export async function recalcRecipes(orgId: string, recipes: QueryDocumentSnapshot[], cause: { id: string; name: string }) {
  if (!recipes.length) return;
  const db = getFirestore();
  const org = db.doc(`organizations/${orgId}`);
  const [ingById, pack, orgSnap] = await Promise.all([loadIngredientMap(orgId), loadPackaging(orgId), org.get()]);
  const orgTarget = Number(orgSnap.data()?.settings?.targetCostRate) || DEFAULT_TARGET_RATE;

  // 砂糖のように多くのレシピで使う材料もあるので、500件の上限が無い BulkWriter で書く
  const batch = db.bulkWriter();
  for (const r of recipes) {
    const input = sanitizeRecipe(r.data());
    if (typeof input === "string") continue;
    const derived = deriveRecipe(input, ingById, pack);
    // 版は上げない（中身は変えていない。計算結果だけ更新する）
    batch.update(r.ref, {
      allergens: derived.allergens, costCache: derived.costCache,
      packagingIds: derived.packagingIds, packagingSetIds: derived.packagingSetIds,
    });

    const old = (r.data().costCache ?? null) as CostCache | null;
    const target = input.targetCostRate ?? orgTarget;
    const rate = derived.costCache.rate;
    if (rate !== null && rate > target && (old?.rate ?? 0) <= target) {
      batch.set(org.collection("alerts").doc(), {
        kind: "costOverTarget",
        recipeId: r.id,
        recipeName: input.name,
        ingredientId: cause.id,
        ingredientName: cause.name,
        oldRate: old?.rate ?? null,
        newRate: rate,
        target,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.close();
}

export const onIngredientWritten = onDocumentWritten(
  { document: "organizations/{orgId}/ingredients/{ingredientId}", region: REGION },
  async (event) => {
    const { orgId, ingredientId } = event.params;
    const before = event.data?.before.data() as Ingredient | undefined;
    const after = event.data?.after.data() as Ingredient | undefined;
    if (!before || !after) return; // 新しく作った・消したときは、使っているレシピがまだ無い／保存時に計算し直す
    if (!WATCH.some((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))) return;

    const org = getFirestore().doc(`organizations/${orgId}`);
    if (before.purchasePrice !== after.purchasePrice || before.purchaseQty !== after.purchaseQty || before.purchaseUnit !== after.purchaseUnit) {
      await org.collection(`ingredients/${ingredientId}/priceHistory`).add({
        from: { price: before.purchasePrice ?? null, qty: before.purchaseQty, unit: before.purchaseUnit },
        to: { price: after.purchasePrice ?? null, qty: after.purchaseQty, unit: after.purchaseUnit },
        at: FieldValue.serverTimestamp(),
      });
    }

    const recipes = await org.collection("recipes").where("ingredientIds", "array-contains", ingredientId).get();
    await recalcRecipes(orgId, recipes.docs, { id: ingredientId, name: after.name });
  },
);
