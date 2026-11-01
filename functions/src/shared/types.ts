// 画面とサーバーで共通のデータの形（Firestore に保存する形と同じ）
// 金額は円（小数可。表示のときに丸める）、重さは g。

import type { RefWeb, WebOffers } from "./offers";
import type { AllergenId } from "./allergens";
import type { LabelInfo } from "./label";
import type { RefPrice } from "./refPrice";
import type { Unit } from "./units";

export type Role = "owner" | "admin" | "editor" | "viewer";

/** 店舗の材料マスター organizations/{orgId}/ingredients/{id} */
export interface Ingredient {
  id: string;
  name: string;
  /** 仕入れ値：purchasePrice 円で purchaseQty purchaseUnit を買う（例：1,200円で 1 kg）。未入力は null */
  purchasePrice: number | null;
  /** 仕入れ値をどの形で入れたか（0＝税抜・0.08・0.1＝税込。shared/cost.ts の PRICE_TAX_OPTIONS）。計算は purchasePrice（税抜）だけ使う */
  priceTax?: number;
  purchaseQty: number;
  purchaseUnit: Unit;
  /** 1個・1枚・1本あたりの g（個数で使う材料だけ） */
  gramsPerPiece?: number | null;
  /** 1ml あたりの g（液体。無ければ 1） */
  gramsPerMl?: number | null;
  allergens: AllergenId[];
  /** お店での別の呼び方（キビ糖・きび糖など）。取り込みや材料選びで、この名前もこの材料に結びつく */
  aliases?: string[];
  /** お店がアレルゲンを確かめたら true。取り込みで作った材料は無い（ラベルで「未確認」と出す） */
  allergensConfirmed?: boolean;
  /** ラベルに出す名前（無ければ name）。既製品は「チョコレート（砂糖、カカオマス…）」のように中身まで書ける */
  labelName?: string;
  /** 添加物なら true（ラベルで「／」のあとに並べる） */
  isAdditive?: boolean;
  /** 共有マスターとの紐付け（globalIngredients / ugcProducts の id） */
  globalRef?: string | null;
  /** "ref"＝仕入れ値が空だったので共有の材料の参考価格を入れた（画面に「参考価格」と出す）。お店が値段を直すと消える */
  priceSource?: "ref" | null;
  /** AIがネット（Google 検索）で調べた値段の記録：何を想定したか・見たページ・検索の候補（画面に出すのが利用の条件）。
   *  調べた日 at・税込の値段 price・量 qty/unit も残し、お店が自分の仕入れ値に直しても消さない（あとで比べられるように）。
   *  いまの仕入れ値がこの値段かどうかは webPriceInUse（shared/offers.ts） */
  refWeb?: RefWeb | null;
  /** ネットで値段を比べた結果（shared/offers.ts。選んだ候補 picked も） */
  offers?: WebOffers | null;
  supplier?: string;
  /** 写真（Storage のパス orgs/{orgId}/ingredients/… か、既製品から写した ugc/…） */
  photoPath?: string | null;
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
  /** よく使う工程から入れたとき、その id と何番目の工程か（よく使う工程を直したら、ここを手がかりに反映する） */
  templateId?: string;
  templateStep?: number;
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
  /** 分類（大きな分け方：焼菓子・ケーキ・料理・ドリンク） */
  category: string;
  /** 種類（分類の中の分け方：パウンドケーキ・クッキー・和食）。前からあるレシピには無い */
  subcategory?: string;
  /** タグ（自由なラベル：定番・ギフト・冬限定） */
  tags: string[];
  items: RecipeItem[];
  steps: RecipeStep[];
  yield: RecipeYield;
  /** 売価（税抜・円）。未定なら null。原価率は税抜の売価で計算する */
  sellingPrice: number | null;
  /** 目標原価率（0〜1）。無ければ店舗の既定 */
  targetCostRate: number | null;
  memo?: string;
  /** レシピの写真・イラスト（Storage のパス。先頭が一覧と詳細の表紙） */
  photos?: string[];
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

/** よく使う工程 organizations/{orgId}/stepTemplates/{id}（1つ以上の工程をまとめて呼び出せる） */
export interface StepTemplate {
  id: string;
  name: string;
  steps: string[];
  /** 工程ごとの写真（steps と同じ並び。無いところは ""）。Storage は orgs/{orgId}/recipes/_steps/ */
  photoPaths?: string[];
  updatedAt?: unknown;
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
  /** mext＝食品成分表、ugc＝昇格した既製品、base＝運営が用意した基本の材料（shared/globalSeed.ts）、shop＝お店の提案を運営が採用したもの */
  source: "mext" | "ugc" | "base" | "shop";
  /** 文科省の食品番号（mext のとき。base も成分表の食品に結んだら入る） */
  mextCode?: string;
  /** ugc のとき：元の既製品 */
  maker?: string;
  ugcId?: string;
  ingredientsText?: string;
  photoPath?: string | null;
  /** 参考価格（税込。shared/refPrice.ts）。お店の仕入れ値ではない */
  refPrice?: RefPrice | null;
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
  /** パッケージの写真（Storage のパス ugc/{orgId}/…） */
  photoPath?: string | null;
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

/**
 * 共有の材料への提案 globalSuggestions/{id}。運営が精査画面（/admin/suggestions）で採用・却下する。
 * - お店から（source "shop"、id は {orgId}_{ingredientId}）：設定 shareIngredients がオンのお店が、アレルゲンを確かめた材料
 * - AIの推定（source "ai"、id は ai_{globalId}）：参考価格が無い共有の材料の値段の目安
 * 書くのは Functions だけ。お店の名前は運営だけが見る（共有の材料には出さない）
 */
export interface GlobalSuggestion {
  id: string;
  source: "shop" | "ai";
  kind: "new" | "update";
  status: "pending" | "accepted" | "rejected";
  orgId: string | null;
  orgName: string;
  ingredientId: string | null;
  /** update のとき：結びついている共有の材料 */
  globalId: string | null;
  globalName: string;
  name: string;
  /** 共有の材料にまだ無い呼び方 */
  aliases: string[];
  /** お店が確かめたアレルゲン（全部）。共有と違うときだけ入る（同じなら null） */
  allergens: AllergenId[] | null;
  labelName: string;
  /** 値段（税抜・円）。AIの推定は note に理由 */
  price: { price: number; qty: number; unit: Unit; supplier?: string } | null;
  note: string;
  /** AIが Google 検索で調べた値段のとき：見たページ（運営が精査で確かめる） */
  sources?: { uri: string; title: string }[];
  /** Google 検索の「検索の候補」（グラウンディングの結果を見せるときに出す決まり。精査画面に出す） */
  searchHtml?: string;
  /** 同じ中身を何度も出さないための印 */
  sig: string;
  updatedAt?: unknown;
}
