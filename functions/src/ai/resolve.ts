// 材料名を「店舗の材料」か「共有マスター」に結びつける（設計書 ④ の3段構え）
// 1. 無料の一致：店舗の材料名 → 店舗が覚えた別名 → 共有マスターの標準名・別名
// 2. 無料の候補：似ている順に8件。1位が AUTO_ACCEPT_SCORE 以上ならそのまま採用
// 3. AI：残ったものだけを20件ずつ Gemini に選ばせる（呼ぶ側がクレジットを払う）

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { AI_MATCH_BATCH } from "../shared/credits";
import type { ItemMatch } from "../shared/importTypes";
import { AUTO_ACCEPT_SCORE, buildIndex, exactMatch, rankCandidates, toMatchKey, type IndexedEntry } from "../shared/matchKey";
import type { Ingredient } from "../shared/types";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { globalIndex } from "./globalIndex";
import { MATCH_SCHEMA, MATCH_SYSTEM, matchPrompt, type MatchAnswer } from "./prompts";

export interface OrgMatchData {
  ingredients: Ingredient[];
  tenantIndex: IndexedEntry[];
  /** 照合キー → 共有マスターの id（店舗が覚えた別名） */
  aliases: Map<string, string>;
}

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

/** 共有マスターの id に結びついた店舗の材料があれば、そちらを優先する */
function preferTenant(m: ItemMatch, org: OrgMatchData): ItemMatch {
  if (m.kind !== "global" || !m.id) return m;
  const own = org.ingredients.find((i) => i.globalRef === m.id);
  return own ? { ...m, kind: "tenant", id: own.id, name: own.name } : m;
}

export async function resolveNames(org: OrgMatchData, names: string[], useAi: boolean): Promise<{ matches: ItemMatch[]; usage: Usage; aiCalls: number }> {
  const g = await globalIndex();
  const results = new Map<string, ItemMatch>();
  const pending: { key: string; name: string; candidates: { id: string; name: string }[] }[] = [];

  for (const name of names) {
    const key = toMatchKey(name);
    if (!key || results.has(key) || pending.some((p) => p.key === key)) continue;
    const own = exactMatch(name, org.tenantIndex);
    if (own) {
      results.set(key, { kind: "tenant", id: own.id, name: own.name, confidence: 1, via: "exact" });
      continue;
    }
    const aliasId = org.aliases.get(key);
    const aliasHit = aliasId ? g.byId.get(aliasId) : undefined;
    const hit = aliasHit ?? exactMatch(name, g.index);
    if (hit) {
      results.set(key, preferTenant({ kind: "global", id: hit.id, name: hit.name, confidence: 1, via: "exact" }, org));
      continue;
    }
    const cands = rankCandidates(name, g.index, 8);
    const list = cands.map((c) => ({ id: c.id, name: c.name }));
    if (cands[0] && cands[0].score >= AUTO_ACCEPT_SCORE) {
      results.set(key, preferTenant({ kind: "global", id: cands[0].id, name: cands[0].name, confidence: cands[0].score, via: "similar", candidates: list }, org));
    } else if (useAi && list.length) {
      pending.push({ key, name, candidates: list });
    } else {
      const top = cands[0];
      results.set(key, top && top.score >= 0.5
        ? preferTenant({ kind: "global", id: top.id, name: top.name, confidence: top.score * 0.8, via: "similar", candidates: list }, org)
        : { kind: "none", id: null, name: null, confidence: 0, via: "none", candidates: list });
    }
  }

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
        ? preferTenant({ kind: "global", id: picked.id, name: picked.name, confidence: clamp(a!.c), via: "ai", candidates: p.candidates }, org)
        : { kind: "none", id: null, name: null, confidence: 0, via: "none", candidates: p.candidates });
    });
  }

  const none: ItemMatch = { kind: "none", id: null, name: null, confidence: 0, via: "none" };
  return { matches: names.map((n) => results.get(toMatchKey(n)) ?? none), usage, aiCalls };
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
