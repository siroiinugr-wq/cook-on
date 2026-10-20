// 名寄せの「AIを使わない部分」（設計書 ④ の1段目・2段目）。サーバーの ai/resolve.ts とデモモードが同じここを使う。
// 決まらなかった名前は pending として返し、AIに回すかどうかは呼ぶ側が決める。
import type { ItemMatch } from "./importTypes";
import { AUTO_ACCEPT_SCORE, exactMatch, rankCandidates, toMatchKey, type IndexedEntry } from "./matchKey";
import type { Ingredient } from "./types";

export interface LocalMatchInput {
  ingredients: Ingredient[];
  tenantIndex: IndexedEntry[];
  /** 照合キー → 共有マスターの id（店舗が覚えた別名） */
  aliases: Map<string, string>;
  globalIndex: IndexedEntry[];
  globalById: Map<string, { id: string; name: string }>;
}

export interface Pending {
  key: string;
  name: string;
  candidates: { id: string; name: string }[];
}

/** 共有マスターの id に結びついた店舗の材料があれば、そちらを優先する */
export function preferTenant(m: ItemMatch, ingredients: Ingredient[]): ItemMatch {
  if (m.kind !== "global" || !m.id) return m;
  const own = ingredients.find((i) => i.globalRef === m.id);
  return own ? { ...m, kind: "tenant", id: own.id, name: own.name } : m;
}

export function resolveLocal(input: LocalMatchInput, names: string[], willUseAi: boolean): { results: Map<string, ItemMatch>; pending: Pending[] } {
  const results = new Map<string, ItemMatch>();
  const pending: Pending[] = [];
  const prefer = (m: ItemMatch) => preferTenant(m, input.ingredients);

  for (const name of names) {
    const key = toMatchKey(name);
    if (!key || results.has(key) || pending.some((p) => p.key === key)) continue;
    const own = exactMatch(name, input.tenantIndex);
    if (own) {
      results.set(key, { kind: "tenant", id: own.id, name: own.name, confidence: 1, via: "exact" });
      continue;
    }
    const aliasId = input.aliases.get(key);
    const aliasHit = aliasId ? input.globalById.get(aliasId) : undefined;
    const hit = aliasHit ?? exactMatch(name, input.globalIndex);
    if (hit) {
      results.set(key, prefer({ kind: "global", id: hit.id, name: hit.name, confidence: 1, via: "exact" }));
      continue;
    }
    const cands = rankCandidates(name, input.globalIndex, 8);
    const list = cands.map((c) => ({ id: c.id, name: c.name }));
    const top = cands[0];
    if (top && top.score >= AUTO_ACCEPT_SCORE) {
      results.set(key, prefer({ kind: "global", id: top.id, name: top.name, confidence: top.score, via: "similar", candidates: list }));
    } else if (willUseAi && list.length) {
      pending.push({ key, name, candidates: list });
    } else if (top && top.score >= 0.5) {
      // AIを使わないときは「たぶんこれ」として出し、自信は低めにして人に確かめてもらう
      results.set(key, prefer({ kind: "global", id: top.id, name: top.name, confidence: Math.round(top.score * 80) / 100, via: "similar", candidates: list }));
    } else {
      results.set(key, { kind: "none", id: null, name: null, confidence: 0, via: "none", candidates: list });
    }
  }
  return { results, pending };
}

export const NO_MATCH: ItemMatch = { kind: "none", id: null, name: null, confidence: 0, via: "none" };
