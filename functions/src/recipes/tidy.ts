// データの整理（取り込んだあとの見直し）。画面は pages/TidyPage.tsx。AIを使うのは「AIで探す」だけ（クレジット）。
// - tidyRecipes：何個分・名前を直す、同じ材料の行をまとめる（どれも saveRecipe と同じく前の版を履歴に残す）
// - mergeIngredients：表記ゆれの材料を1つにまとめる（レシピの行を付け替えてから、まとめた側を消す）
// - relinkIngredients：共有の材料に結ぶ（確かなものはその場で、迷うものは候補。AIを使うならクレジット）。値段が空なら参考価格
// - confirmLinks：人が選んだ候補で結ぶ
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { sortAllergens } from "../shared/allergens";
import { toMatchKey } from "../shared/matchKey";
import { sanitizeRecipe } from "../shared/recipe";
import { resolveLocal } from "../shared/resolveLocal";
import { mergeDuplicateItems } from "../shared/tidy";
import { linkPatch, misLinked, refPricePatch } from "../shared/link";
import { AI_MATCH_BATCH } from "../shared/credits";
import type { ItemMatch } from "../shared/importTypes";
import type { GlobalIngredient, Ingredient } from "../shared/types";
import { GEMINI_API_KEY, REGION } from "../ai/config";
import { globalIndex } from "../ai/globalIndex";
import { loadOrgMatchData, rememberAliases, resolveNames } from "../ai/resolve";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
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

export interface LinkSuggestion {
  ingredientId: string;
  name: string;
  /** 無料の照合（似た名前）か AI が選んだもの。人が確かめてから結ぶ */
  pick: { id: string; name: string; confidence: number; via: string } | null;
  candidates: { id: string; name: string }[];
  /** 結び直しの候補のとき：今の結び先の名前 */
  current?: string;
}

/**
 * 共有の材料に結ぶ。
 * 1. 名前が完全に同じ・覚えた別名のものは、その場で結ぶ（無料）
 * 2. それ以外は候補を返す。useAi なら AI が候補から選ぶ（AI_MATCH_BATCH 件で1クレジット）。どちらも結ぶのは人が確かめてから（confirmLinks）
 * 3. 結びついていて仕入れ値が空の材料に、参考価格を入れる（「参考価格」の印付き）
 */
export const relinkIngredients = onCall({ region: REGION, timeoutSeconds: 300, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const useAi = req.data?.useAi === true;
  const db = getFirestore();
  const [org, g] = await Promise.all([loadOrgMatchData(orgId), globalIndex()]);
  const loose = org.ingredients.filter((i) => !i.globalRef);
  const local = resolveLocal({ ...org, tenantIndex: [], globalIndex: g.index, globalById: g.byId }, loose.map((i) => i.name), useAi);

  const writer = db.bulkWriter();
  const refs = await loadGlobals(db, [...new Set([...org.ingredients.map((i) => i.globalRef ?? ""), ...[...local.results.values()].map((m) => (m.via === "exact" ? m.id ?? "" : ""))])].filter(Boolean));
  let linked = 0;
  let priced = 0;
  const rest: Ingredient[] = [];
  for (const ing of loose) {
    const m = local.results.get(toMatchKey(ing.name));
    const gl = m && m.kind === "global" && m.via === "exact" && m.id ? refs.get(m.id) : undefined;
    if (!gl) { rest.push(ing); continue; }
    const p = linkPatch(ing, gl);
    if (p.priceSource === "ref") priced++;
    writer.set(db.doc(`organizations/${orgId}/ingredients/${ing.id}`), p, { merge: true });
    linked++;
  }
  for (const ing of org.ingredients) {
    const gl = ing.globalRef ? refs.get(ing.globalRef) : undefined;
    const p = refPricePatch(ing, gl);
    if (!p.priceSource) continue;
    writer.set(db.doc(`organizations/${orgId}/ingredients/${ing.id}`), p, { merge: true });
    priced++;
  }
  await writer.close();

  // 残りの候補。AIを使うなら、無料で決まらなかった分だけ AI に選ばせる（クレジット）
  const toSuggestions = (matches: Map<string, ItemMatch>) => rest.map((ing): LinkSuggestion => {
    const m = matches.get(toMatchKey(ing.name));
    const pick = m && m.kind === "global" && m.id ? { id: m.id, name: m.name ?? "", confidence: m.confidence, via: m.via } : null;
    return { ingredientId: ing.id, name: ing.name, pick, candidates: (m?.candidates ?? []).slice(0, 8) };
  }).filter((x) => x.pick || x.candidates.length);
  // 以前の別名のせいで違う材料に結びついていそうなもの（発酵バター→無塩バターなど）
  const relinks: LinkSuggestion[] = misLinked(org.ingredients, g.index).map(({ ing, to }) => ({
    ingredientId: ing.id, name: ing.name, pick: { id: to.id, name: to.name, confidence: 1, via: "exact" },
    candidates: [{ id: to.id, name: to.name }, ...(ing.globalRef && g.byId.get(ing.globalRef) ? [{ id: ing.globalRef, name: g.byId.get(ing.globalRef)!.name }] : [])],
    current: g.byId.get(ing.globalRef ?? "")?.name ?? "",
  }));
  const base = { linked, priced, checked: loose.length, globals: g.byId.size };
  const pendingNames = local.pending.map((x) => x.name);
  if (!useAi || !pendingNames.length) return { ...base, suggestions: [...relinks, ...toSuggestions(local.results)], aiUsed: 0 };

  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  return runWithCredits({ orgId, uid, action: "aiMatch", units: Math.ceil(pendingNames.length / AI_MATCH_BATCH), requestId }, async () => {
    const r = await resolveNames({ ...org, tenantIndex: [] }, rest.map((i) => i.name), true);
    const matches = new Map(rest.map((ing, k) => [toMatchKey(ing.name), r.matches[k]]));
    return { result: { ...base, suggestions: [...relinks, ...toSuggestions(matches)], aiUsed: r.aiCalls }, usage: r.usage, usedUnits: Math.max(1, r.aiCalls) };
  });
});

/** 人が確かめた結びつきを保存する。名前は店舗の別名として覚え、次からは無料で結ぶ */
export const confirmLinks = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const links = (Array.isArray(req.data?.links) ? req.data.links : []).slice(0, 300)
    .map((l: { ingredientId?: unknown; globalId?: unknown }) => ({ ingredientId: idOf(l?.ingredientId, "材料"), globalId: idOf(l?.globalId, "共有の材料") }));
  if (!links.length) throw new HttpsError("invalid-argument", "結ぶ材料を選んでください。");
  const db = getFirestore();
  const [ingById, refs] = await Promise.all([loadIngredientMap(orgId), loadGlobals(db, links.map((l: { globalId: string }) => l.globalId))]);
  const writer = db.bulkWriter();
  const remember: { name: string; globalId: string }[] = [];
  let linked = 0;
  let priced = 0;
  for (const l of links as { ingredientId: string; globalId: string }[]) {
    const ing = ingById.get(l.ingredientId);
    const gl = refs.get(l.globalId);
    if (!ing || !gl) continue;
    const p = linkPatch(ing, gl);
    if (p.priceSource === "ref") priced++;
    writer.set(db.doc(`organizations/${orgId}/ingredients/${ing.id}`), p, { merge: true });
    remember.push({ name: ing.name, globalId: gl.id });
    linked++;
  }
  await writer.close();
  await rememberAliases(orgId, remember);
  return { linked, priced };
});

async function loadGlobals(db: Firestore, ids: string[]): Promise<Map<string, GlobalIngredient>> {
  const out = new Map<string, GlobalIngredient>();
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => db.doc(`globalIngredients/${id}`));
    if (!refs.length) continue;
    for (const d of await db.getAll(...refs)) if (d.exists) out.set(d.id, { ...(d.data() as GlobalIngredient), id: d.id });
  }
  return out;
}
