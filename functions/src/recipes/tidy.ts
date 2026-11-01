// データの整理（取り込んだあとの見直し）。画面は pages/TidyPage.tsx。AIは使わないので無料。
// - tidyRecipes：何個分・名前を直す、同じ材料の行をまとめる（どれも saveRecipe と同じく前の版を履歴に残す）
// - mergeIngredients：表記ゆれの材料を1つにまとめる（レシピの行を付け替えてから、まとめた側を消す）
// - relinkIngredients：共有の材料（はじめの材料・食品成分表）に結びついていない材料を、名前で結び直す
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { sortAllergens } from "../shared/allergens";
import { toMatchKey } from "../shared/matchKey";
import { sanitizeRecipe } from "../shared/recipe";
import { resolveLocal } from "../shared/resolveLocal";
import { mergeDuplicateItems } from "../shared/tidy";
import type { Ingredient } from "../shared/types";
import { REGION } from "../ai/config";
import { globalIndex } from "../ai/globalIndex";
import { loadOrgMatchData } from "../ai/resolve";
import { idOf, requireRole, ROLES } from "../core/auth";
import { loadIngredientMap, writeRecipe } from "./save";

export interface RecipePatch {
  recipeId: string;
  pieces?: number;
  name?: string;
  mergeDuplicates?: boolean;
}

const MAX_PATCHES = 200;

/** 1件ずつ直して保存する（前の版は versions に残る）。直せなかったものは理由を返す */
export const tidyRecipes = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const patches = (Array.isArray(req.data?.patches) ? req.data.patches : []).slice(0, MAX_PATCHES) as RecipePatch[];
  if (!patches.length) throw new HttpsError("invalid-argument", "直すレシピがありません。");
  const db = getFirestore();
  let done = 0;
  const failed: { recipeId: string; reason: string }[] = [];
  for (const p of patches) {
    try {
      const recipeId = idOf(p?.recipeId, "レシピID");
      const snap = await db.doc(`organizations/${orgId}/recipes/${recipeId}`).get();
      if (!snap.exists) throw new Error("見つかりません");
      const input = sanitizeRecipe(snap.data());
      if (typeof input === "string") throw new Error(input);
      const notes: string[] = [];
      if (typeof p.name === "string" && p.name.trim() && p.name.trim() !== input.name) {
        input.name = p.name.trim().slice(0, 60);
        notes.push("名前");
      }
      const pieces = Number(p.pieces);
      if (Number.isFinite(pieces) && pieces > 0 && pieces !== input.yield.pieces) {
        input.yield = { ...input.yield, pieces: Math.min(10000, pieces) };
        notes.push("何個分");
      }
      if (p.mergeDuplicates) {
        const merged = mergeDuplicateItems(input.items);
        if (merged.length !== input.items.length) {
          input.items = merged;
          notes.push("同じ材料の行をまとめた");
        }
      }
      if (!notes.length) continue;
      await writeRecipe(orgId, recipeId, input, uid, `データの整理：${notes.join("・")}`);
      done++;
    } catch (e) {
      failed.push({ recipeId: String(p?.recipeId ?? ""), reason: String((e as Error)?.message ?? e) });
    }
  }
  return { done, failed };
});

/** keepId に dropIds をまとめる。レシピの行を付け替え、値段が無ければ写し、アレルゲンは足し合わせる */
export const mergeIngredients = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const keepId = idOf(req.data?.keepId, "残す材料");
  const dropIds = [...new Set((Array.isArray(req.data?.dropIds) ? req.data.dropIds : []).map((x: unknown) => idOf(x, "まとめる材料")))]
    .filter((x) => x !== keepId).slice(0, 10) as string[];
  if (!dropIds.length) throw new HttpsError("invalid-argument", "まとめる材料を選んでください。");

  const db = getFirestore();
  const org = `organizations/${orgId}`;
  const ingById = await loadIngredientMap(orgId);
  const keep = ingById.get(keepId);
  if (!keep) throw new HttpsError("not-found", "残す材料が見つかりません。");
  const drops = dropIds.map((id) => ingById.get(id)).filter((x): x is Ingredient => !!x);
  if (!drops.length) throw new HttpsError("not-found", "まとめる材料が見つかりません。");

  // 1. 残す材料に、値段（無ければ）・アレルゲン・共有の材料との結びつきを写す
  const priced = keep.purchasePrice === null ? drops.find((d) => d.purchasePrice !== null) : undefined;
  const allergens = sortAllergens([keep, ...drops].flatMap((d) => d.allergens ?? []));
  const sameAllergens = allergens.length === (keep.allergens ?? []).length;
  // まとめた側の名前と別名は、残す材料の別名として覚える（次の取り込みから同じ材料に結びつく）
  const aliases = [...new Set([...(keep.aliases ?? []), ...drops.flatMap((d) => [d.name, ...(d.aliases ?? [])])])]
    .filter((a) => a && a !== keep.name).slice(0, 20);
  await db.doc(`${org}/ingredients/${keepId}`).set({
    allergens, aliases,
    // 足したアレルゲンがあれば、もう一度確かめてもらう
    allergensConfirmed: keep.allergensConfirmed === true && sameAllergens,
    ...(keep.globalRef ? {} : { globalRef: drops.find((d) => d.globalRef)?.globalRef ?? null }),
    ...(priced ? { purchasePrice: priced.purchasePrice, purchaseQty: priced.purchaseQty, purchaseUnit: priced.purchaseUnit, priceTax: priced.priceTax ?? 0 } : {}),
  }, { merge: true });

  // 2. 使っているレシピの行を付け替える（前の版は履歴に残る）
  const snaps = await db.collection(`${org}/recipes`).where("ingredientIds", "array-contains-any", dropIds).get();
  let recipes = 0;
  for (const s of snaps.docs) {
    const input = sanitizeRecipe(s.data());
    if (typeof input === "string") continue;
    input.items = input.items.map((it) => (it.ingredientId && dropIds.includes(it.ingredientId)
      ? { ...it, ingredientId: keepId, name: keep.name, note: it.note || `元の表記：${it.name}`.slice(0, 60) }
      : it));
    await writeRecipe(orgId, s.id, input, uid, `材料をまとめた：${drops.map((d) => d.name).join("・")} → ${keep.name}`);
    // 保存すると一覧に戻るので、しまってあったレシピはしまい直す
    if (s.data().archived === true) await s.ref.update({ archived: true });
    recipes++;
  }

  // 3. まとめた側を消す
  const batch = db.batch();
  for (const d of drops) batch.delete(db.doc(`${org}/ingredients/${d.id}`));
  await batch.commit();
  return { recipes, removed: drops.length };
});

/** 共有の材料に結びついていない材料を、名前の一致（AIを使わない）で結ぶ。アレルゲンは足すだけで、確認済みにはしない */
export const relinkIngredients = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const db = getFirestore();
  const [org, g] = await Promise.all([loadOrgMatchData(orgId), globalIndex()]);
  const loose = org.ingredients.filter((i) => !i.globalRef);
  if (!loose.length) return { linked: 0, checked: 0, globals: g.byId.size };
  const { results } = resolveLocal({ ...org, tenantIndex: [], globalIndex: g.index, globalById: g.byId }, loose.map((i) => i.name), false);

  const writer = db.bulkWriter();
  let linked = 0;
  for (const ing of loose) {
    const m = results.get(toMatchKey(ing.name));
    // 確かなものだけ（完全一致・覚えた別名・とても似ている）
    if (!m || m.kind !== "global" || !m.id || m.confidence < 0.9) continue;
    const gl = g.byId.get(m.id);
    if (!gl) continue;
    const allergens = sortAllergens([...(ing.allergens ?? []), ...gl.allergens]);
    const added = allergens.length !== (ing.allergens ?? []).length;
    writer.set(db.doc(`organizations/${orgId}/ingredients/${ing.id}`), {
      globalRef: gl.id, allergens, ...(added ? { allergensConfirmed: false } : {}),
    }, { merge: true });
    linked++;
  }
  await writer.close();
  return { linked, checked: loose.length, globals: g.byId.size };
});
