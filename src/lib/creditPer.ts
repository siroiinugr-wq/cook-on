// 「何ごとに何クレジット」の言い方。クレジットの画面と、やること・AIの画面が同じものを使う
import { AI_MATCH_BATCH, IMPORT_CHUNK_CHARS, LABEL_NAME_BATCH, PRICE_SEARCH_BATCH, SIZE_SEARCH_BATCH, type CreditAction } from "@shared/credits";

export const CREDIT_PER: Record<CreditAction, string> = {
  aiMatch: `${AI_MATCH_BATCH}件ごと`,
  importChunk: `${IMPORT_CHUNK_CHARS.toLocaleString()}文字ごと`,
  importPhoto: "写真1枚",
  invoicePhoto: "レシート1枚",
  priceCompare: "1材料",
  priceSearch: `${PRICE_SEARCH_BATCH}品ごと・参考価格がある品は0`,
  sizeSearch: `${SIZE_SEARCH_BATCH}品ごと・ほかのお店が調べた品は0`,
  productGuess: "1商品",
  productPhoto: "写真1枚",
  aiSuggest: "1回",
  labelName: `${LABEL_NAME_BATCH}件ごと`,
};
