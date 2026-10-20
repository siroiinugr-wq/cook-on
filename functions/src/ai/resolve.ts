// 材料名を「店舗の材料」か「共有マスター」に結びつける（設計書 ④ の3段構え）
// 1・2段目（無料の一致と候補）は shared/resolveLocal.ts。デモモードと同じ決まりで動く
// 3段目：残ったものだけを20件ずつ Gemini に選ばせる（呼ぶ側がクレジットを払う）

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { AI_MATCH_BATCH } from "../shared/credits";
import type { ItemMatch } from "../shared/importTypes";
import { buildIndex, toMatchKey } from "../shared/matchKey";
import { NO_MATCH, preferTenant, resolveLocal, type LocalMatchInput } from "../shared/resolveLocal";
import type { Ingredient } from "../shared/types";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { globalIndex } from "./globalIndex";
import { MATCH_SCHEMA, MATCH_SYSTEM, matchPrompt, type MatchAnswer } from "./prompts";

export type OrgMatchData = Omit<LocalMatchInput, "globalIndex" | "globalById">;

export async function loadOrgMatchData(orgId: string): Promise<OrgMatchData> {
  const db = getFirestore();
  const [ings, als] = await Promise.all([
    db.collection(`organizations/${orgId}/ingredients`).get(),
    db.collection(`organizations/${orgId}/aliases`).get(),
  ]);
  const ingredients = ings.docs.map((d) => ({ ...(d.data() as Ingredient), id: d.id }));
  return {
    ingredients,
    tenantIndex: buildIndex(ingredients.map((i) => ({ id: i.id, name: i.name, aliases: [] }))),
    aliases: new Map(als.docs.map((d) => [d.id, String(d.data().globalId ?? "")])),
  };
}

export async function resolveNames(org: OrgMatchData, names: string[], useAi: boolean): Promise<{ matches: ItemMatch[]; usage: Usage; aiCalls: number }> {
  const g = await globalIndex();
  const { results, pending } = resolveLocal({ ...org, globalIndex: g.index, globalById: g.byId }, names, useAi);

  let usage: Usage = { in: 0, out: 0 };
  let aiCalls = 0;
  for (let i = 0; i < pending.length; i += AI_MATCH_BATCH) {
    const batch = pending.slice(i, i + AI_MATCH_BATCH);
    const { output, usage: u } = await callGeminiJson<MatchAnswer>({
      system: MATCH_SYSTEM, prompt: matchPrompt(batch), schema: MATCH_SCHEMA, maxOutputTokens: 1024,
    });
    usage = addUsage(usage, u);
    aiCalls += 1;
    batch.forEach((p, j) => {
      const a = output.r?.find((x) => x.i === j);
      // 候補に無い id は捨てる（AIが作った id を信用しない）
      const picked = a?.id ? p.candidates.find((c) => c.id === a.id) : undefined;
      results.set(p.key, picked
        ? preferTenant({ kind: "global", id: picked.id, name: picked.name, confidence: clamp(a!.c), via: "ai", candidates: p.candidates }, org.ingredients)
        : { ...NO_MATCH, candidates: p.candidates });
    });
  }
  return { matches: names.map((n) => results.get(toMatchKey(n)) ?? NO_MATCH), usage, aiCalls };
}

const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));

/** 確かな結びつき（AIで0.85以上、または人が選んだもの）を店舗の別名として覚える。次からは無料で一致する */
export async function rememberAliases(orgId: string, pairs: { name: string; globalId: string }[]) {
  if (!pairs.length) return;
  const db = getFirestore();
  const batch = db.batch();
  for (const p of pairs.slice(0, 400)) {
    // 照合キーをそのままドキュメントIDにする（toMatchKey は "/" を消すので、パスとして安全）
    const key = toMatchKey(p.name);
    if (!key || key.length > 100 || key === "." || key === ".." || /^__.*__$/.test(key)) continue;
    batch.set(db.doc(`organizations/${orgId}/aliases/${key}`), {
      name: p.name, globalId: p.globalId, updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}
