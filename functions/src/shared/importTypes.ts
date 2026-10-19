// データ取り込み（他社からの引っ越し）の形。organizations/{orgId}/imports/{id}
import type { Unit } from "./units";

/** 名寄せの結果。tenant＝店舗の材料、global＝共有マスター、none＝新しい材料として作る */
export interface ItemMatch {
  kind: "tenant" | "global" | "none";
  id: string | null;
  name: string | null;
  /** 0〜1。exact は 1 */
  confidence: number;
  via: "exact" | "similar" | "ai" | "user" | "none";
  /** 画面で選び直せるよう、近い候補も残す（global の id と名前） */
  candidates?: { id: string; name: string }[];
}

export interface ParsedItem {
  /** 元のファイルに書いてあった材料名 */
  raw: string;
  /** AIが書いた一般的な食材名（名寄せに使う） */
  std: string;
  qty: number | null;
  unit: Unit;
  match: ItemMatch;
}

export interface ParsedRecipe {
  name: string;
  category: string;
  pieces: number | null;
  items: ParsedItem[];
  steps: string[];
  notes: string;
  /** 画面で「取り込まない」にしたもの */
  skip?: boolean;
}

export type ImportStatus = "parsing" | "preview" | "saving" | "saved" | "failed";

export interface ImportDoc {
  status: ImportStatus;
  fileName: string;
  chars: number;
  chunks: number;
  /** 読めなかった部分の番号（0始まり）。その分のクレジットは返している */
  failedChunks: number[];
  creditsUsed: number;
  recipes: ParsedRecipe[];
  createdBy: string;
  error?: string;
  createdAt?: unknown;
  savedRecipeIds?: string[];
}

/** 名寄せの自信の色分け（プレビュー画面） */
export function matchLevel(m: ItemMatch): "ok" | "check" | "new" {
  if (m.kind === "none") return "new";
  return m.confidence >= 0.85 ? "ok" : "check";
}
