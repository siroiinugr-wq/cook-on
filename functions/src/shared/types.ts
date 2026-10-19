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
  perPiece: number;
  /** 売価があれば原価率（0〜1） */
  rate: number | null;
  /** 単価が無くて計算に入っていない材料の数 */
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
  // ── 保存時にサーバーが作る列（検索用。画面からは直接書かない）──
  ingredientIds: string[];
  allergens: AllergenId[];
  costCache: CostCache | null;
  version: number;
  updatedAt?: unknown;
  updatedBy?: string;
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
  source: "mext" | "ugc";
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
