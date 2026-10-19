// 材料名の名寄せ（AIを使わない部分）
// 1. 照合キー：全角半角・ひらがなカタカナ・空白・かっこ書きをそろえた文字
// 2. 完全一致：標準名か別名のキーが同じなら決定（無料）
// 3. 候補：2文字ずつの一致度（Dice係数）と、含む・含まれるで上位を出す（無料）
// ここで決まらなかったものだけを AI（ai/normalize.ts）に回す。

export interface MatchEntry {
  id: string;
  name: string;
  aliases: string[];
}

export interface IndexedEntry extends MatchEntry {
  keys: string[];
  grams: Set<string>[];
}

export interface Candidate {
  id: string;
  name: string;
  score: number;
}

/** 照合キー。「ﾌﾞﾗｯｸ チョコ（明治）」→「ブラックチョコ」 */
export function toMatchKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[（(［[【〔].*?[）)］\]】〕]/g, "")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･,、。.\-_/／'"]/g, "");
}

export function bigrams(key: string): Set<string> {
  const out = new Set<string>();
  if (key.length === 1) out.add(key);
  for (let i = 0; i < key.length - 1; i++) out.add(key.slice(i, i + 2));
  return out;
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const g of a) if (b.has(g)) common++;
  return (2 * common) / (a.size + b.size);
}

export function buildIndex(entries: MatchEntry[]): IndexedEntry[] {
  return entries.map((e) => {
    const keys = [...new Set([e.name, ...e.aliases].map(toMatchKey).filter(Boolean))];
    return { ...e, keys, grams: keys.map(bigrams) };
  });
}

export function exactMatch(name: string, index: IndexedEntry[]): IndexedEntry | null {
  const k = toMatchKey(name);
  if (!k) return null;
  return index.find((e) => e.keys.includes(k)) ?? null;
}

/** 似ている順に n 件。含む・含まれる（「チョコ」と「チョコレート」）は 0.6 以上にする */
export function rankCandidates(name: string, index: IndexedEntry[], n = 8): Candidate[] {
  const k = toMatchKey(name);
  if (!k) return [];
  const g = bigrams(k);
  const scored: Candidate[] = [];
  for (const e of index) {
    let best = 0;
    e.keys.forEach((key, i) => {
      let s = dice(g, e.grams[i]);
      if (key.length >= 2 && k.length >= 2 && (key.includes(k) || k.includes(key))) {
        s = Math.max(s, 0.6 + 0.4 * (Math.min(key.length, k.length) / Math.max(key.length, k.length)));
      }
      if (s > best) best = s;
    });
    if (best >= 0.2) scored.push({ id: e.id, name: e.name, score: Math.round(best * 100) / 100 });
  }
  return scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, n);
}

/** この点数以上の1位は、AIを使わずに「たぶんこれ」として出してよい */
export const AUTO_ACCEPT_SCORE = 0.9;
