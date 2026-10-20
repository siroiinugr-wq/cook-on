// 原価高騰アラート（設計書 ①）。AIは使わないので無料。
// 材料の仕入れ値・アレルゲンが変わったら、その材料を使うレシピの原価とアレルゲンを計算し直す。
// 原価率が目標を超えたら（前は超えていなかったら）alerts に書く。値上がりは priceHistory に残す。
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { DEFAULT_TARGET_RATE } from "../shared/cost";
import { deriveRecipe, sanitizeRecipe } from "../shared/recipe";
import type { CostCache, Ingredient } from "../shared/types";
import { REGION } from "../ai/config";
import { loadIngredientMap } from "./save";

const WATCH: (keyof Ingredient)[] = ["purchasePrice", "purchaseQty", "purchaseUnit", "gramsPerPiece", "gramsPerMl", "allergens"];

export const onIngredientWritten = onDocumentWritten(
  { document: "organizations/{orgId}/ingredients/{ingredientId}", region: REGION },
  async (event) => {
    const { orgId, ingredientId } = event.params;
    const before = event.data?.before.data() as Ingredient | undefined;
    const after = event.data?.after.data() as Ingredient | undefined;
    if (!before || !after) return; // 新しく作った・消したときは、使っているレシピがまだ無い／保存時に計算し直す
    if (!WATCH.some((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))) return;

    const db = getFirestore();
    const org = db.doc(`organizations/${orgId}`);
    if (before.purchasePrice !== after.purchasePrice || before.purchaseQty !== after.purchaseQty || before.purchaseUnit !== after.purchaseUnit) {
      await org.collection(`ingredients/${ingredientId}/priceHistory`).add({
        from: { price: before.purchasePrice ?? null, qty: before.purchaseQty, unit: before.purchaseUnit },
        to: { price: after.purchasePrice ?? null, qty: after.purchaseQty, unit: after.purchaseUnit },
        at: FieldValue.serverTimestamp(),
      });
    }

    const recipes = await org.collection("recipes").where("ingredientIds", "array-contains", ingredientId).get();
    if (recipes.empty) return;
    const [ingById, orgSnap] = await Promise.all([loadIngredientMap(orgId), org.get()]);
    const orgTarget = Number(orgSnap.data()?.settings?.targetCostRate) || DEFAULT_TARGET_RATE;

    // 砂糖のように多くのレシピで使う材料もあるので、500件の上限が無い BulkWriter で書く
    const batch = db.bulkWriter();
    for (const r of recipes.docs) {
      const input = sanitizeRecipe(r.data());
      if (typeof input === "string") continue;
      const derived = deriveRecipe(input, ingById);
      // 版は上げない（中身は変えていない。計算結果だけ更新する）
      batch.update(r.ref, { allergens: derived.allergens, costCache: derived.costCache });

      const old = (r.data().costCache ?? null) as CostCache | null;
      const target = input.targetCostRate ?? orgTarget;
      const rate = derived.costCache.rate;
      if (rate !== null && rate > target && (old?.rate ?? 0) <= target) {
        batch.set(org.collection("alerts").doc(), {
          kind: "costOverTarget",
          recipeId: r.id,
          recipeName: input.name,
          ingredientId,
          ingredientName: after.name,
          oldRate: old?.rate ?? null,
          newRate: rate,
          target,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    await batch.close();
  },
);
