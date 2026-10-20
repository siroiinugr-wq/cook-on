// クレジットの単価と、AIに渡す量の上限。画面（押す前の表示）とサーバー（実際に引く量）が同じこのファイルを読む。
// ig-saas では単価が画面とサーバーの2か所にあって食い違ったので、COOK ON では必ずここ1か所だけにする。

export const YEN_PER_CREDIT = 10;

export const CREDIT_COST = {
  /** 表記ゆれの名寄せ（AI_MATCH_BATCH 件まで） */
  aiMatch: 1,
  /** 取り込み：IMPORT_CHUNK_CHARS 文字ごと */
  importChunk: 1,
  /** 既製品の原材料・成分の下書き */
  productGuess: 1,
  /** 原価ダウン・新作の提案（1回の質問） */
  aiSuggest: 2,
} as const;
export type CreditAction = keyof typeof CREDIT_COST;

export const ACTION_LABEL: Record<CreditAction | "purchase" | "grant" | "welcome", string> = {
  aiMatch: "材料名をAIで探す",
  importChunk: "データの取り込み",
  productGuess: "既製品の情報をAIで下書き",
  aiSuggest: "AIに相談",
  purchase: "購入",
  grant: "付与",
  welcome: "はじめてのプレゼント",
};

export const AI_MATCH_BATCH = 20;
export const IMPORT_CHUNK_CHARS = 6000;
/** 1回の取り込みの上限（これを超えるファイルは分けてもらう） */
export const IMPORT_MAX_CHARS = 120_000;
/** 相談の文の上限 */
export const SUGGEST_MAX_CHARS = 400;
/** はじめて店舗を作ったときに付けるお試し分 */
export const WELCOME_CREDITS = 10;

/** 販売するまとめ買い（Stripe を有効にしたら使う） */
export const CREDIT_PACKS = [
  { id: "p100", credits: 100, priceYen: 1000 },
  { id: "p550", credits: 550, priceYen: 5000 },
  { id: "p1150", credits: 1150, priceYen: 10000 },
] as const;

/**
 * 取り込む文字を、行の切れ目で IMPORT_CHUNK_CHARS 以下に分ける。
 * 見積り（画面）と実際の消費（サーバー）が同じ分け方になるよう、両方ここを使う。
 */
export function splitForImport(text: string, size = IMPORT_CHUNK_CHARS): string[] {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const out: string[] = [];
  let cur = "";
  for (const line of clean.split("\n")) {
    // 1行が長すぎるときは途中で切る
    for (let i = 0; i < Math.max(1, line.length); i += size) {
      const part = line.slice(i, i + size);
      if (cur && cur.length + part.length + 1 > size) {
        out.push(cur);
        cur = "";
      }
      cur = cur ? `${cur}\n${part}` : part;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function importCredits(text: string): number {
  return splitForImport(text).length * CREDIT_COST.importChunk;
}

export function aiMatchCredits(count: number): number {
  return Math.ceil(count / AI_MATCH_BATCH) * CREDIT_COST.aiMatch;
}
