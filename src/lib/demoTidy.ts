// デモモードの「データの整理」の関数（本番は functions/src/recipes/tidy.ts）。同じ名前・同じ引数・同じ返り値
import { sortAllergens } from "@shared/allergens";
import { buildIndex, toMatchKey } from "@shared/matchKey";
import { sanitizeRecipe } from "@shared/recipe";
import { resolveLocal } from "@shared/resolveLocal";
import { mergeDuplicateItems } from "@shared/tidy";
import { demoGet, demoListDocs, demoWrite } from "./demo";
import { DEMO_ORG } from "./demoData";
import { demoIngredientMap, demoWriteRecipe } from "./demoFunctions";

type Data = Record<string, unknown>;
const O = `organizations/${DEMO_ORG}`;

export function demoTidyCall(name: string, d: Data): unknown | undefined {
  if (name === "tidyRecipes") {
    let done = 0;
    for (const p of (d.patches as { recipeId: string; pieces?: number; name?: string; mergeDuplicates?: boolean }[]) ?? []) {
      const cur = demoGet(`${O}/recipes/${p.recipeId}`);
      const input = cur ? sanitizeRecipe(cur) : null;
      if (!input || typeof input === "string") continue;
      const notes: string[] = [];
      if (p.name?.trim() && p.name.trim() !== input.name) { input.name = p.name.trim(); notes.push("名前"); }
      if (p.pieces && p.pieces > 0 && p.pieces !== input.yield.pieces) { input.yield = { ...input.yield, pieces: p.pieces }; notes.push("何個分"); }
      if (p.mergeDuplicates) {
        const merged = mergeDuplicateItems(input.items);
        if (merged.length !== input.items.length) { input.items = merged; notes.push("同じ材料の行をまとめた"); }
      }
      if (!notes.length) continue;
      demoWriteRecipe(p.recipeId, input, `データの整理：${notes.join("・")}`);
      done++;
    }
    return { done, failed: [] };
  }
  if (name === "mergeIngredients") {
    const ings = demoIngredientMap();
    const keep = ings.get(String(d.keepId));
    const drops = ((d.dropIds as string[]) ?? []).filter((id) => id !== d.keepId).map((id) => ings.get(id)).filter((x) => !!x);
    if (!keep || !drops.length) throw new Error("まとめる材料が見つかりません。");
    const allergens = sortAllergens([keep, ...drops].flatMap((x) => x.allergens ?? []));
    const priced = keep.purchasePrice === null ? drops.find((x) => x.purchasePrice !== null) : undefined;
    const kp = `${O}/ingredients/${keep.id}`;
    demoWrite(kp, {
      ...demoGet(kp)!, allergens,
      aliases: [...new Set([...(keep.aliases ?? []), ...drops.flatMap((x) => [x.name, ...(x.aliases ?? [])])])].filter((a) => a !== keep.name).slice(0, 20),
      allergensConfirmed: keep.allergensConfirmed === true && allergens.length === keep.allergens.length,
      ...(priced ? { purchasePrice: priced.purchasePrice, purchaseQty: priced.purchaseQty, purchaseUnit: priced.purchaseUnit } : {}),
    });
    const dropIds = drops.map((x) => x.id);
    let recipes = 0;
    for (const r of demoListDocs(`${O}/recipes`)) {
      if (!((r.data.ingredientIds as string[]) ?? []).some((id) => dropIds.includes(id))) continue;
      const input = sanitizeRecipe(r.data);
      if (typeof input === "string") continue;
      input.items = input.items.map((it) => (it.ingredientId && dropIds.includes(it.ingredientId) ? { ...it, ingredientId: keep.id, name: keep.name } : it));
      demoWriteRecipe(r.id, input, `材料をまとめた：${drops.map((x) => x.name).join("・")} → ${keep.name}`);
      recipes++;
    }
    for (const id of dropIds) demoWrite(`${O}/ingredients/${id}`, null);
    return { recipes, removed: dropIds.length };
  }
  if (name === "relinkIngredients") {
    const ingredients = [...demoIngredientMap().values()];
    const globals = demoListDocs("globalIngredients").map((x) => ({ id: x.id, name: String(x.data.name), aliases: (x.data.aliases as string[]) ?? [], allergens: (x.data.allergens as string[]) ?? [] }));
    const loose = ingredients.filter((i) => !i.globalRef);
    const { results } = resolveLocal({
      ingredients, tenantIndex: [], aliases: new Map(), globalIndex: buildIndex(globals), globalById: new Map(globals.map((g) => [g.id, g])),
    }, loose.map((i) => i.name), false);
    let linked = 0;
    for (const ing of loose) {
      const m = results.get(toMatchKey(ing.name));
      const gl = m && m.kind === "global" && m.id && m.confidence >= 0.9 ? globals.find((g) => g.id === m.id) : undefined;
      if (!gl) continue;
      const allergens = sortAllergens([...ing.allergens, ...gl.allergens]);
      const p = `${O}/ingredients/${ing.id}`;
      demoWrite(p, { ...demoGet(p)!, globalRef: gl.id, allergens, ...(allergens.length !== ing.allergens.length ? { allergensConfirmed: false } : {}) });
      linked++;
    }
    return { linked, checked: loose.length, globals: globals.length };
  }
  return undefined;
}
