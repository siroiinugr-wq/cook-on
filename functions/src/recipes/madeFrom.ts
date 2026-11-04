// 自家製の材料（Ingredient.madeFrom）に、それを作るレシピの値段・アレルゲン・成分（100gあたり）を入れ直す（AIなし・無料）。
// 成分は中身の材料が結んだ共有の材料（成分表・既製品）の nutrition から。自家製の中身は、その材料に入れた nutrition を使う。
// 呼ぶところ：レシピの保存（save.ts の writeRecipe）、材料の値段が変わってレシピを計算し直したあと（costAlert.ts の recalcRecipes）、
// 材料をレシピに結んだとき（onIngredientWritten）。書いた材料のトリガが、その材料を使うレシピをまた計算し直す（つながっていく）。
// 同じ値なら書かない・ぐるぐる回る結び方（自分を使うレシピ）は入れないので、止まる。
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { REGION } from "../ai/config";
import { idOf, requireRole, ROLES } from "../core/auth";
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

  const nutCache = new Map<string, Record<string, number> | null>();
  const nutOf = (ing: Ingredient) => ing.nutrition ?? (ing.globalRef ? nutCache.get(ing.globalRef) : null) ?? null;

  let wrote = 0;
  for (const t of linked) {
    const rid = t.data.madeFrom!;
    // 自分（自家製の材料）を使うレシピに結んでいたら入れない（値段が回り続ける）
    if (usesIngredient(rid, t.id, recipeIngredients, madeFromOf)) continue;
    const snap = await db.doc(`${org}/recipes/${rid}`).get();
    if (!snap.exists) continue;
    const input = sanitizeRecipe(snap.data());
    if (typeof input === "string") continue;
    await loadNutrition(db, input.items.flatMap((it) => {
      const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined;
      return ing && !ing.nutrition && ing.globalRef ? [ing.globalRef] : [];
    }), nutCache);
    const { missing: _missing, ...patch } = madeFromPatch(input.items, ingById, nutOf);
    if (!madeFromChanged(t.data, patch)) continue;
    await db.doc(`${org}/ingredients/${t.id}`).update(patch);
    wrote += 1;
  }
  return wrote;
}

/** 共有の材料（globalIngredients、無ければ既製品 ugcProducts）の100gあたりの成分を読んで cache に入れる */
async function loadNutrition(db: Firestore, refs: string[], cache: Map<string, Record<string, number> | null>) {
  const ids = [...new Set(refs)].filter((id) => !cache.has(id));
  if (!ids.length) return;
  const g = await db.getAll(...ids.map((id) => db.doc(`globalIngredients/${id}`)));
  const rest: string[] = [];
  g.forEach((s, i) => {
    const n = s.exists ? (s.get("nutrition") as Record<string, number> | undefined) : undefined;
    if (n && Object.keys(n).length) cache.set(ids[i], n);
    else rest.push(ids[i]);
  });
  if (rest.length) {
    const u = await db.getAll(...rest.map((id) => db.doc(`ugcProducts/${id}`)));
    u.forEach((s, i) => {
      const n = s.exists ? (s.get("nutrition") as Record<string, number> | undefined) : undefined;
      cache.set(rest[i], n && Object.keys(n).length ? n : null);
    });
  }
}

/** 結んである自家製の材料を、まとめて入れ直す（成分の計算を足す前に結んだ材料・成分表を入れ直したあと用。無料） */
export const refreshMadeFrom = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const snap = await getFirestore().collection(`organizations/${orgId}/ingredients`).where("madeFrom", "!=", null).get();
  const recipeIds = snap.docs.map((d) => String(d.get("madeFrom") ?? "")).filter(Boolean);
  // 結び先の中身にまた自家製があっても、書いた材料のトリガが外側を入れ直す
  const wrote = await syncMadeFrom(orgId, recipeIds);
  return { linked: snap.size, updated: wrote };
});
