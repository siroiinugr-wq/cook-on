// 取り込みのプレビューを、材料マスターとレシピに保存する
// - 店舗の材料に結びついた行 → その材料
// - 共有マスターに結びついた行 → 同じ共有マスターを使う店舗の材料があればそれ、無ければ作る（仕入れ値は空）
// - 結びつかなかった行 → 名前で新しい材料を作る（同じ名前は1つにまとめる）
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { ParsedRecipe } from "../shared/importTypes";
import { toMatchKey } from "../shared/matchKey";
import { deriveRecipe, sanitizeRecipe } from "../shared/recipe";
import type { Ingredient } from "../shared/types";
import { globalIndex } from "../ai/globalIndex";
import { rememberAliases } from "../ai/resolve";
import { loadIngredientMap } from "./save";

const MAX_RECIPES = 300;

export async function saveImportedRecipes(orgId: string, uid: string, recipes: ParsedRecipe[]): Promise<string[]> {
  const db = getFirestore();
  const org = `organizations/${orgId}`;
  const ingById = await loadIngredientMap(orgId);
  const g = await globalIndex();
  const byGlobal = new Map([...ingById.values()].filter((i) => i.globalRef).map((i) => [i.globalRef!, i.id]));
  const byName = new Map([...ingById.values()].map((i) => [toMatchKey(i.name), i.id]));
  const newIngs: Ingredient[] = [];
  const aliases: { name: string; globalId: string }[] = [];

  const create = (name: string, globalId: string | null): string => {
    const gl = globalId ? g.byId.get(globalId) : undefined;
    const ing: Ingredient = {
      id: db.collection(`${org}/ingredients`).doc().id,
      name: (gl?.name ?? name).slice(0, 60),
      purchasePrice: null,
      purchaseQty: 1,
      purchaseUnit: "kg",
      allergens: gl?.allergens ?? [],
      globalRef: gl ? gl.id : null,
    };
    newIngs.push(ing);
    ingById.set(ing.id, ing);
    byName.set(toMatchKey(ing.name), ing.id);
    if (gl) byGlobal.set(gl.id, ing.id);
    return ing.id;
  };

  const inputs = recipes.slice(0, MAX_RECIPES).map((r) => {
    const items = r.items.map((it) => {
      const m = it.match;
      let id: string | null = null;
      if (m.kind === "tenant" && m.id && ingById.has(m.id)) id = m.id;
      else if (m.kind === "global" && m.id && g.byId.has(m.id)) {
        id = byGlobal.get(m.id) ?? create(it.std || it.raw, m.id);
        if (m.via === "user" || (m.via === "ai" && m.confidence >= 0.85)) aliases.push({ name: it.std || it.raw, globalId: m.id });
      } else {
        const name = (it.std || it.raw).trim();
        if (name) id = byName.get(toMatchKey(name)) ?? create(name, null);
      }
      const ing = id ? ingById.get(id) : undefined;
      return { ingredientId: id, name: ing?.name ?? it.raw, qty: it.qty, unit: it.unit, ...(it.raw && it.raw !== ing?.name ? { note: `元の表記：${it.raw}` } : {}) };
    });
    return sanitizeRecipe({
      name: r.name, category: r.category, tags: ["取り込み"], items,
      steps: r.steps.map((text) => ({ text })), yield: { pieces: r.pieces ?? 1 },
      sellingPrice: null, targetCostRate: null, memo: r.notes,
    });
  }).filter((x) => typeof x !== "string");

  // Firestore の一括書き込みは500件まで。材料 → レシピの順に400件ずつ
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const ing of newIngs) {
    const { id, ...data } = ing;
    writes.push((b) => b.set(db.doc(`${org}/ingredients/${id}`), { ...data, createdBy: uid, createdAt: FieldValue.serverTimestamp() }));
  }
  const ids: string[] = [];
  for (const input of inputs) {
    if (typeof input === "string") continue;
    const ref = db.collection(`${org}/recipes`).doc();
    ids.push(ref.id);
    const derived = deriveRecipe(input, ingById);
    writes.push((b) => b.set(ref, {
      ...input, ...derived, version: 1, archived: false, updatedBy: uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }));
  }
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach((w) => w(b));
    await b.commit();
  }
  await rememberAliases(orgId, aliases);
  return ids;
}
