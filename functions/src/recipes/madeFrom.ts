// 自家製の材料（Ingredient.madeFrom）に、それを作るレシピの値段・アレルゲンを入れ直す（AIなし・無料）。
// 呼ぶところ：レシピの保存（save.ts の writeRecipe）、材料の値段が変わってレシピを計算し直したあと（costAlert.ts の recalcRecipes）、
// 材料をレシピに結んだとき（onIngredientWritten）。書いた材料のトリガが、その材料を使うレシピをまた計算し直す（つながっていく）。
// 同じ値なら書かない・ぐるぐる回る結び方（自分を使うレシピ）は入れないので、止まる。
import { getFirestore } from "firebase-admin/firestore";
import { madeFromChanged, madeFromPatch, usesIngredient } from "../shared/madeFrom";
import { sanitizeRecipe } from "../shared/recipe";
import type { Ingredient } from "../shared/types";

/** recipeIds のレシピから作る自家製の材料（onlyIngredient を渡せばその材料だけ）を入れ直す。書いた数を返す */
export async function syncMadeFrom(orgId: string, recipeIds: string[], onlyIngredient?: string): Promise<number> {
  const ids = [...new Set(recipeIds)].filter(Boolean);
  if (!ids.length) return 0;
  const db = getFirestore();
  const org = `organizations/${orgId}`;

  // 結んでいる材料（無ければここで終わり。ほとんどのレシピはこれだけで済む）
  const targets: { id: string; data: Ingredient }[] = [];
  if (onlyIngredient) {
    const s = await db.doc(`${org}/ingredients/${onlyIngredient}`).get();
    if (s.exists) targets.push({ id: s.id, data: s.data() as Ingredient });
  } else {
    for (let i = 0; i < ids.length; i += 30) {
      const s = await db.collection(`${org}/ingredients`).where("madeFrom", "in", ids.slice(i, i + 30)).get();
      targets.push(...s.docs.map((d) => ({ id: d.id, data: d.data() as Ingredient })));
    }
  }
  const linked = targets.filter((t) => t.data.madeFrom && ids.includes(t.data.madeFrom));
  if (!linked.length) return 0;

  const [ingSnap, recSnap] = await Promise.all([
    db.collection(`${org}/ingredients`).get(),
    db.collection(`${org}/recipes`).select("ingredientIds").get(),
  ]);
  const ingById = new Map(ingSnap.docs.map((d) => [d.id, { ...(d.data() as Ingredient), id: d.id }]));
  const madeFromOf = new Map(ingSnap.docs.flatMap((d) => (d.data().madeFrom ? [[d.id, String(d.data().madeFrom)] as const] : [])));
  const recipeIngredients = new Map(recSnap.docs.map((d) => [d.id, (d.data().ingredientIds ?? []) as string[]]));

  let wrote = 0;
  for (const t of linked) {
    const rid = t.data.madeFrom!;
    // 自分（自家製の材料）を使うレシピに結んでいたら入れない（値段が回り続ける）
    if (usesIngredient(rid, t.id, recipeIngredients, madeFromOf)) continue;
    const snap = await db.doc(`${org}/recipes/${rid}`).get();
    if (!snap.exists) continue;
    const input = sanitizeRecipe(snap.data());
    if (typeof input === "string") continue;
    const { missing: _missing, ...patch } = madeFromPatch(input.items, ingById);
    if (!madeFromChanged(t.data, patch)) continue;
    await db.doc(`${org}/ingredients/${t.id}`).update(patch);
    wrote += 1;
  }
  return wrote;
}
