// スタッフ用の写し（shared/staffView.ts）を作る・消すトリガと、まとめて作り直す処理。
// 元の recipes / ingredients が変わるたびに、値段を抜いた形を staffRecipes / staffIngredients に写す。
// 原価だけが変わったとき（材料の値上がりで計算し直したなど）は、写しの中身が同じなので書かない。
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue, type DocumentData } from "firebase-admin/firestore";
import { isDeepStrictEqual } from "node:util";
import { REGION } from "../ai/config";
import { STAFF_INGREDIENTS, STAFF_RECIPES, staffIngredient, staffRecipe } from "../shared/staffView";

type Strip = (d: Record<string, unknown>) => Record<string, unknown>;

async function mirror(orgId: string, col: string, id: string, before: DocumentData | undefined, after: DocumentData | undefined, strip: Strip) {
  const ref = getFirestore().doc(`organizations/${orgId}/${col}/${id}`);
  if (!after) {
    if (before) await ref.delete();
    return;
  }
  const next = strip(after);
  if (before && isDeepStrictEqual(strip(before), next)) return;
  await ref.set(next);
}

export const onRecipeMirror = onDocumentWritten(
  { document: "organizations/{orgId}/recipes/{id}", region: REGION },
  (event) => mirror(event.params.orgId, STAFF_RECIPES, event.params.id, event.data?.before.data(), event.data?.after.data(), staffRecipe),
);

export const onIngredientMirror = onDocumentWritten(
  { document: "organizations/{orgId}/ingredients/{id}", region: REGION },
  (event) => mirror(event.params.orgId, STAFF_INGREDIENTS, event.params.id, event.data?.before.data(), event.data?.after.data(), staffIngredient),
);

/** 店舗のレシピと材料の写しをすべて作り直す（はじめて公開したとき・スタッフが入ったとき）。終わったら organizations.staffViewsAt を付ける */
export async function rebuildStaffViews(orgId: string): Promise<{ recipes: number; ingredients: number }> {
  const db = getFirestore();
  const org = db.doc(`organizations/${orgId}`);
  const count = { recipes: 0, ingredients: 0 };
  for (const [src, dst, strip, key] of [
    ["recipes", STAFF_RECIPES, staffRecipe, "recipes"],
    ["ingredients", STAFF_INGREDIENTS, staffIngredient, "ingredients"],
  ] as const) {
    const [all, old] = await Promise.all([org.collection(src).get(), org.collection(dst).select().get()]);
    const live = new Set(all.docs.map((d) => d.id));
    const writer = db.bulkWriter();
    for (const d of all.docs) writer.set(org.collection(dst).doc(d.id), strip(d.data()));
    // 元が消えている写しは消す
    for (const d of old.docs) if (!live.has(d.id)) writer.delete(d.ref);
    await writer.close();
    count[key] = all.size;
  }
  await org.update({ staffViewsAt: FieldValue.serverTimestamp() });
  return count;
}

/** まだ写しを作っていない店舗だけ作る */
export async function ensureStaffViews(orgId: string): Promise<void> {
  const org = await getFirestore().doc(`organizations/${orgId}`).get();
  if (!org.get("staffViewsAt")) await rebuildStaffViews(orgId);
}
