// クレジットの単価と、AIに渡す量の上限。画面（押す前の表示）とサーバー（実際に引く量）が同じこのファイルを読む。
// ig-saas では単価が画面とサーバーの2か所にあって食い違ったので、COOK ON では必ずここ1か所だけにする。

import { splitImportText } from "./importSplit";

export const YEN_PER_CREDIT = 10;

export const CREDIT_COST = {
  /** 表記ゆれの名寄せ（AI_MATCH_BATCH 件まで） */
  aiMatch: 1,
  /** 取り込み：IMPORT_CHUNK_CHARS 文字ごと */
  importChunk: 1,
  /** 写真から取り込み：1枚ごと */
  importPhoto: 1,
  /** 既製品の原材料・成分の下書き */
  productGuess: 1,
  /** 既製品のパッケージの裏（原材料・栄養成分）の写真を読む：1枚ごと。表の写真は画像にするだけで使わない */
  productPhoto: 1,
  /** ラベルに出す名前（一般的名称）の案：LABEL_NAME_BATCH 件ごと */
  labelName: 1,
  /** レシート・納品書の写真から仕入れ値を読む：1枚ごと */
  invoicePhoto: 1,
  /** 仕入れ明細の包装の量を Google 検索つきのAIで確かめる：SIZE_SEARCH_BATCH 品ごと（共有の表で分かった品は数えない） */
  sizeSearch: 1,
  /** 仕入れ値が空の材料の値段を Google 検索つきのAIで調べる：PRICE_SEARCH_BATCH 品ごと（共有の参考価格で入る品は数えない） */
  priceSearch: 1,
  /** 材料1つの売り場と値段を Google 検索つきのAIで比べる：1回ごと */
  priceCompare: 1,
  /** 原価ダウン・新作の提案（1回の質問） */
  aiSuggest: 2,
} as const;
export type CreditAction = keyof typeof CREDIT_COST;

export const ACTION_LABEL: Record<CreditAction | "purchase" | "grant" | "welcome", string> = {
  aiMatch: "材料名をAIで探す",
  importChunk: "データの取り込み",
  importPhoto: "写真から取り込み",
  productGuess: "既製品の情報をAIで下書き",
  productPhoto: "既製品のパッケージを読み取り",
  aiSuggest: "AIに相談",
  labelName: "ラベルの名前をAIで提案",
  invoicePhoto: "レシート・納品書から仕入れ値を読む",
  sizeSearch: "仕入れ品の量をネットで確かめる",
  priceSearch: "仕入れ値をネットで調べる",
  priceCompare: "ネットで値段を比べる",
  purchase: "購入",
  grant: "付与",
  welcome: "はじめてのプレゼント",
};

export const AI_MATCH_BATCH = 20;
/**
 * 量をネットで確かめる：1クレジットで何品まで。
 * 検索は1品ずつで、1品に3〜7円かかる（検索の料金）。5品で1クレジットでは赤字なので1品ごとにした（2026-11-11）
 */
export const SIZE_SEARCH_BATCH = 1;
/** 量をネットで確かめる：1回に頼める品数 */
export const SIZE_SEARCH_MAX = 20;

/** 仕入れ値をネットで調べる：1クレジットで何品まで・1回に調べる品数 */
export const PRICE_SEARCH_BATCH = 1;
export const PRICE_SEARCH_MAX = 20;

export function priceSearchCredits(n: number): number {
  return Math.ceil(Math.min(n, PRICE_SEARCH_MAX) / PRICE_SEARCH_BATCH) * CREDIT_COST.priceSearch;
}

export function sizeSearchCredits(n: number): number {
  return Math.ceil(Math.min(n, SIZE_SEARCH_MAX) / SIZE_SEARCH_BATCH) * CREDIT_COST.sizeSearch;
}
/** ラベルの名前の案：1クレジットで何件まで */
export const LABEL_NAME_BATCH = 20;
/** ラベルの名前の案：1回に頼める件数 */
export const LABEL_NAME_MAX = 200;

export function labelNameCredits(n: number): number {
  return Math.ceil(Math.min(n, LABEL_NAME_MAX) / LABEL_NAME_BATCH);
}
export const IMPORT_CHUNK_CHARS = 6000;
/** 1回の取り込みの上限（これを超えるファイルは分けてもらう） */
export const IMPORT_MAX_CHARS = 120_000;
/**
 * 無制限の店舗（organizations.unlimited = true、運営がコンソールで付ける）の1回の上限。
 * これより長いと関数の時間切れ（30分）や取り込み結果の保存の上限に当たるので、無制限でもここで止める。
 */
export const IMPORT_MAX_CHARS_UNLIMITED = 300_000;

export function importMaxChars(unlimited: boolean): number {
  return unlimited ? IMPORT_MAX_CHARS_UNLIMITED : IMPORT_MAX_CHARS;
}

/** レシート・納品書：1回に読める枚数 */
export const INVOICE_MAX_PHOTOS = 20;

/** 写真から取り込み：1回に読める枚数（無制限の店舗は多め。それでも時間切れを避けるため上限は置く） */
export const IMPORT_MAX_PHOTOS = 30;
export const IMPORT_MAX_PHOTOS_UNLIMITED = 60;

export function importMaxPhotos(unlimited: boolean): number {
  return unlimited ? IMPORT_MAX_PHOTOS_UNLIMITED : IMPORT_MAX_PHOTOS;
}
/** 既製品のパッケージの裏：1回に読める枚数（原材料と栄養成分が別の面に分かれていることがあるため2枚） */
export const PRODUCT_PHOTO_MAX = 2;

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
 * 取り込む文字を IMPORT_CHUNK_CHARS 字ごとの塊に分ける（表は見出しを毎回付け、レシピの切れ目で分ける。shared/importSplit.ts）。
 * 見積り（画面）と実際の消費（サーバー）が同じ分け方になるよう、両方ここを使う。
 */
export function splitForImport(text: string, size = IMPORT_CHUNK_CHARS): string[] {
  return splitImportText(text, size);
}

export function importCredits(text: string): number {
  return splitForImport(text).length * CREDIT_COST.importChunk;
}

export function aiMatchCredits(count: number): number {
  return Math.ceil(count / AI_MATCH_BATCH) * CREDIT_COST.aiMatch;
}
