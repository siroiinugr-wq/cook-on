// 包装資材・包装セットを直したら、それを使うレシピの原価を計算し直す（材料の onIngredientWritten と同じ）。AIは使わないので無料。
// レシピには保存のときに packagingIds（セットの中身も含む資材）と packagingSetIds が書いてあるので、それで探す
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import type { PackagingMaterial, PackagingSet } from "../shared/types";
import { REGION } from "../ai/config";
import { recalcRecipes } from "./costAlert";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const onPackagingWritten = onDocumentWritten(
  { document: "organizations/{orgId}/packaging/{packagingId}", region: REGION },
  async (event) => {
    const { orgId, packagingId } = event.params;
    const before = event.data?.before.data() as PackagingMaterial | undefined;
    const after = event.data?.after.data() as PackagingMaterial | undefined;
    if (!before) return; // 新しく作った資材を使うレシピはまだ無い
    if (after && same(before.purchasePrice, after.purchasePrice) && same(before.purchaseQty, after.purchaseQty)) return;
    const recipes = await getFirestore().collection(`organizations/${orgId}/recipes`).where("packagingIds", "array-contains", packagingId).get();
    await recalcRecipes(orgId, recipes.docs, { id: packagingId, name: (after ?? before).name });
  },
);

export const onPackagingSetWritten = onDocumentWritten(
  { document: "organizations/{orgId}/packagingSets/{setId}", region: REGION },
  async (event) => {
    const { orgId, setId } = event.params;
    const before = event.data?.before.data() as PackagingSet | undefined;
    const after = event.data?.after.data() as PackagingSet | undefined;
    if (!before) return;
    if (after && same(before.items, after.items)) return; // 名前やメモだけなら原価は変わらない
    const recipes = await getFirestore().collection(`organizations/${orgId}/recipes`).where("packagingSetIds", "array-contains", setId).get();
    await recalcRecipes(orgId, recipes.docs, { id: setId, name: (after ?? before).name });
  },
);
