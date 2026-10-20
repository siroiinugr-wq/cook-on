// 画面とサーバーで共通のデータの形（Firestore に保存する形と同じ）
// 金額は円（小数可。表示のときに丸める）、重さは g。

import type { AllergenId } from "./allergens";
import type { LabelInfo } from "./label";
import type { Unit } from "./units";

export type Role = "owner" | "admin" | "editor" | "viewer";

/** 店舗の材料マスター organizations/{orgId}/ingredients/{id} */
export interface Ingredient {
  id: string;
  name: string;
  /** 仕入れ値：purchasePrice 円で purchaseQty purchaseUnit を買う（例：1,200円で 1 kg）。未入力は null */
  purchasePrice: number | null;
  purchaseQty: number;
  purchaseUnit: Unit;
  /** 1個・1枚・1本あたりの g（個数で使う材料だけ） */
  gramsPerPiece?: number | null;
  /** 1ml あたりの g（液体。無ければ 1） */
  gramsPerMl?: number | null;
  allergens: AllergenId[];
  /** ラベルに出す名前（無ければ name）。既製品は「チョコレート（砂糖、カカオマス…）」のように中身まで書ける */
  labelName?: string;
  /** 添加物なら true（ラベルで「／」のあとに並べる） */
  isAdditive?: boolean;
  /** 共有マスターとの紐付け（globalIngredients / ugcProducts の id） */
  globalRef?: string | null;
  supplier?: string;
  updatedAt?: unknown;
}

/** レシピの材料1行 */
export interface RecipeItem {
  ingredientId: string | null;
  /** 保存したときの材料名（材料を消しても読めるように） */
  name: string;
  qty: number | null;
  unit: Unit;
  /** 下ごしらえなどのメモ（「室温に戻す」） */
  note?: string;
}

export interface RecipeStep {
  text: string;
  /** Storage のパス orgs/{orgId}/recipes/{recipeId}/{file} */
  photoPath?: string | null;
}

/** 仕上がり：1ロットで何個できるか */
export interface RecipeYield {
  pieces: number;
  /** 1個あたりの重さ（ラベルの内容量。無ければ材料の合計から計算） */
  gramsPerPiece?: number | null;
}

export interface CostCache {
  total: number;
  /** 1個あたり（材料＋包装） */
  perPiece: number;
  /** うち包装（1個あたり）。包装が無いレシピ・前からあるレシピは無い */
  packagingPerPiece?: number;
  /** 売価があれば原価率（0〜1） */
  rate: number | null;
  /** 単価が無くて計算に入っていない材料・包装の数 */
  missing: number;
  computedAt: string;
}

/** organizations/{orgId}/recipes/{id} */
export interface Recipe {
  id: string;
  name: string;
  category: string;
  tags: string[];
  items: RecipeItem[];
  steps: RecipeStep[];
  yield: RecipeYield;
  /** 売価（税抜・円）。未定なら null。原価率は税抜の売価で計算する */
  sellingPrice: number | null;
  /** 目標原価率（0〜1）。無ければ店舗の既定 */
  targetCostRate: number | null;
  memo?: string;
  /** ラベルの名称・保存方法・期限など（無ければラベル画面の既定） */
  labelInfo?: Partial<LabelInfo>;
  /** 包装（1個あたり。袋・脱酸素剤・包装セット）。前からあるレシピには無い */
  packaging?: RecipePackLine[];
  // ── 保存時にサーバーが作る列（検索用。画面からは直接書かない）──
  ingredientIds: string[];
  /** 使っている包装資材（セットの中身も含む）とセット。値段やセットを直したとき、計算し直すレシピを探す */
  packagingIds?: string[];
  packagingSetIds?: string[];
  allergens: AllergenId[];
  costCache: CostCache | null;
  version: number;
  updatedAt?: unknown;
  updatedBy?: string;
}

/** 包装資材 organizations/{orgId}/packaging/{id}：purchasePrice 円で purchaseQty 枚（個・本）を買う */
export interface PackagingMaterial {
  id: string;
  name: string;
  /** 税抜の円。未入力は null */
  purchasePrice: number | null;
  purchaseQty: number;
  unit: PackUnit;
  /** 仕入れ値を入れたときの形（0＝税抜、0.08/0.1＝税込）。次に開いたとき同じ形で出すためだけ。材料の priceTax と同じ */
  priceTax?: number;
  supplier?: string;
  memo?: string;
  updatedAt?: unknown;
}

export const PACK_UNITS = ["枚", "個", "本", "m"] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

/** 包装セット organizations/{orgId}/packagingSets/{id}（例：10cm袋1枚＋脱酸素剤30 1個） */
export interface PackagingSet {
  id: string;
  name: string;
  items: PackSetItem[];
  memo?: string;
  updatedAt?: unknown;
}
export interface PackSetItem {
  packagingId: string;
  /** 保存したときの資材名（資材を消しても読めるように） */
  name: string;
  qty: number;
}

/** レシピの包装1行（1個あたり）。セットか資材を1つ選び、いくつ使うか */
export interface RecipePackLine {
  kind: "set" | "item";
  /** セットなら packagingSets の id、資材なら packaging の id */
  refId: string | null;
  name: string;
  qty: number;
}

/** 共有マスター globalIngredients/{id} */
export interface GlobalIngredient {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  allergens: AllergenId[];
  /** 100g あたりの成分（kcal, protein, fat, carbohydrate, salt）。無ければ空 */
  nutrition?: Record<string, number>;
  /** mext＝食品成分表、ugc＝昇格した既製品、base＝運営が用意した基本の材料（shared/globalSeed.ts） */
  source: "mext" | "ugc" | "base";
  /** 文科省の食品番号（mext のとき） */
  mextCode?: string;
  /** ugc のとき：元の既製品 */
  maker?: string;
  ugcId?: string;
}

export type UgcStatus = "pending" | "promoted" | "rejected";

/** 店舗が登録した既製品 ugcProducts/{id} */
export interface UgcProduct {
  id: string;
  maker: string;
  productName: string;
  /** パッケージどおりの原材料名 */
  ingredientsText: string;
  allergens: AllergenId[];
  nutrition?: Record<string, number>;
  createdByOrg: string;
  goodCount: number;
  badCount: number;
  status: UgcStatus;
}

export interface Branding {
  appName: string;
  logoUrl: string | null;
  /** テーマカラー（#rrggbb）。主役ボタンとアイコンの色になる */
  primaryColor: string;
}

export const DEFAULT_BRANDING: Branding = { appName: "COOK ON", logoUrl: null, primaryColor: "#d97757" };
