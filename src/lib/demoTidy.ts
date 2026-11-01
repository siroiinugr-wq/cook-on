// デモモードの「データの整理」の関数（本番は functions/src/recipes/tidy.ts）。同じ名前・同じ引数・同じ返り値
import { sortAllergens } from "@shared/allergens";
import { buildIndex, toMatchKey } from "@shared/matchKey";
import { sanitizeRecipe } from "@shared/recipe";
import { resolveLocal } from "@shared/resolveLocal";
import { applyStepPhoto, applyTemplate } from "@shared/steps";
import { mergeDuplicateItems } from "@shared/tidy";
import { linkPatch, misLinked, refPricePatch } from "@shared/link";
import { AI_MATCH_BATCH } from "@shared/credits";
import type { GlobalIngredient, Ingredient, StepTemplate } from "@shared/types";
import { demoGet, demoListDocs, demoWrite } from "./demo";
import { DEMO_ORG } from "./demoData";
import { demoIngredientMap, demoWithCredits, demoWriteRecipe } from "./demoFunctions";

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
  if (name === "syncSteps") {
    const t = d.templateId ? demoGet(`${O}/stepTemplates/${d.templateId}`) as unknown as StepTemplate | null : null;
    if (d.templateId && !t) throw new Error("よく使う工程が見つかりません。");
    let done = 0;
    for (const id of (d.recipeIds as string[]) ?? []) {
      const cur = demoGet(`${O}/recipes/${id}`);
      const input = cur ? sanitizeRecipe(cur) : null;
      if (!input || typeof input === "string") continue;
      const r = t ? applyTemplate(input.steps, { ...t, id: String(d.templateId) }) : applyStepPhoto(input.steps, String(d.stepText), String(d.photoPath));
      if (!r.changed) continue;
      input.steps = r.steps;
      demoWriteRecipe(id, input, t ? `よく使う工程「${t.name}」を反映` : "同じ工程に写真を付けた");
      done++;
    }
    return { done, failed: [] };
  }
  if (name === "relinkIngredients" || name === "confirmLinks") return demoRelink(name, d);
  return undefined;
}

type Glob = GlobalIngredient & { id: string };
const globals = (): Glob[] => demoListDocs("globalIngredients").map((x) => ({ ...(x.data as unknown as GlobalIngredient), id: x.id }));

/** 本番の relinkIngredients・confirmLinks と同じ：確かなものは結び、迷うものは候補。AIはデモでは一番上の候補を選ぶ */
function demoRelink(name: string, d: Data): unknown {
  const gl = globals();
  const byId = new Map(gl.map((g) => [g.id, g]));
  const ings = [...demoIngredientMap().values()];
  const link = (ing: Ingredient, g: Glob) => {
    const p = `${O}/ingredients/${ing.id}`;
    const patch = linkPatch(ing, g);
    demoWrite(p, { ...demoGet(p)!, ...patch });
    return patch.priceSource === "ref";
  };
  if (name === "confirmLinks") {
    let linked = 0;
    let priced = 0;
    for (const l of (d.links as { ingredientId: string; globalId: string }[]) ?? []) {
      const ing = ings.find((i) => i.id === l.ingredientId);
      const g = byId.get(l.globalId);
      if (!ing || !g) continue;
      if (link(ing, g)) priced++;
      linked++;
    }
    return { linked, priced };
  }
  const useAi = d.useAi === true;
  const loose = ings.filter((i) => !i.globalRef);
  const { results, pending } = resolveLocal({
    ingredients: ings, tenantIndex: [], aliases: new Map(), globalIndex: buildIndex(gl), globalById: new Map(gl.map((g) => [g.id, g])),
  }, loose.map((i) => i.name), useAi);
  let linked = 0;
  let priced = 0;
  const rest: Ingredient[] = [];
  for (const ing of loose) {
    const m = results.get(toMatchKey(ing.name));
    const g = m && m.kind === "global" && m.via === "exact" && m.id ? byId.get(m.id) : undefined;
    if (!g) { rest.push(ing); continue; }
    if (link(ing, g)) priced++;
    linked++;
  }
  for (const ing of demoIngredientMap().values()) {
    const g = ing.globalRef ? byId.get(ing.globalRef) : undefined;
    const p = refPricePatch(ing, g);
    if (!p.priceSource) continue;
    demoWrite(`${O}/ingredients/${ing.id}`, { ...demoGet(`${O}/ingredients/${ing.id}`)!, ...p });
    priced++;
  }
  // AIを使うときは、決まらなかった分が pending に入る（候補だけ持っている）
  for (const pd of pending) if (!results.has(pd.key)) results.set(pd.key, { kind: "none", id: null, name: null, confidence: 0, via: "none", candidates: pd.candidates });
  const suggestions = (ai: boolean) => rest.map((ing) => {
    const m = results.get(toMatchKey(ing.name));
    const top = m?.candidates?.[0];
    const pick = m && m.kind === "global" && m.id ? { id: m.id, name: m.name ?? "", confidence: m.confidence, via: m.via }
      : ai && top ? { id: top.id, name: top.name, confidence: 0.7, via: "ai" } : null;
    return { ingredientId: ing.id, name: ing.name, pick, candidates: (m?.candidates ?? []).slice(0, 8) };
  }).filter((x) => x.pick || x.candidates.length);
  const relinks = misLinked([...demoIngredientMap().values()], buildIndex(gl)).map(({ ing, to }) => ({
    ingredientId: ing.id, name: ing.name, pick: { id: to.id, name: to.name, confidence: 1, via: "exact" },
    candidates: [{ id: to.id, name: to.name }, { id: ing.globalRef!, name: byId.get(ing.globalRef!)?.name ?? "" }], current: byId.get(ing.globalRef!)?.name ?? "",
  }));
  const base = { linked, priced, checked: loose.length, globals: gl.length };
  if (!useAi || !pending.length) return { ...base, suggestions: [...relinks, ...suggestions(false)], aiUsed: 0 };
  return demoWithCredits("aiMatch", Math.ceil(pending.length / AI_MATCH_BATCH), async () => ({ result: { ...base, suggestions: [...relinks, ...suggestions(true)], aiUsed: 1 } }));
}
