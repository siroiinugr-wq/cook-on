// AIまわりの定数はここ1か所だけ（設計書 ④）
import { defineSecret, defineString } from "firebase-functions/params";

export const REGION = "asia-northeast1";

/**
 * COOK ON はすべて軽量版。1クレジット（10円）あたりのAPI原価を1〜2円に収めるため（ネット検索は1品3〜7円）。
 * AI経理（ai-accounting）と同じモデル名。モデルが終わるときはここだけ直す。
 */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * 料金（100万トークンあたりのドル）。受付票（aiRequests）に1回ごとの円を残すのに使う。
 * Gemini 3.5 Flash-Lite の公式の料金（https://ai.google.dev/gemini-api/docs/pricing 2026-11-11 確認）。
 * 以前は仮の値（0.25／1.25）で、出力が半分の値段で記録されていた。モデルを変えたらここも直す。
 */
export const GEMINI_PRICE_USD = { in: 0.3, out: 2.5 };
/**
 * Google 検索つき（グラウンディング）の料金：検索1回ごと（1,000回で14ドル）。
 * 月5,000回までは無料だが、原価の記録は無料の分を引かずに数える（増えたときの本当の原価を見るため）。
 * 1回の呼び出しでAIが何回か検索することがあり、その回数ぶんかかる。
 */
export const SEARCH_PRICE_USD = 14 / 1000;
export const USD_JPY = 150;

export function costYen(usage: { in?: number; out?: number; searches?: number }): number {
  const usd = ((usage.in ?? 0) * GEMINI_PRICE_USD.in + (usage.out ?? 0) * GEMINI_PRICE_USD.out) / 1_000_000 + (usage.searches ?? 0) * SEARCH_PRICE_USD;
  return Math.round(usd * USD_JPY * 100) / 100;
}

export const PROMPT_VERSION = "v1.0";
export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
export const REQUEST_TIMEOUT_MS = 120_000;

/**
 * 運営スタッフのメールアドレス（カンマ区切り）。テスト用のクレジット付与ができる。
 * functions/.env.cook-on-plaz に STAFF_EMAILS=... と書いてデプロイする（空なら誰もできない）。
 */
export const STAFF_EMAILS = defineString("STAFF_EMAILS", { default: "" });

/**
 * Stripe の鍵（購入）。制限付きキー（rk_live_…）と Webhook の署名シークレット（whsec_…）。
 * `firebase functions:secrets:set 名前 --project cook-on-plaz` で入れる。入れる前に関数を出すと止まる。手順は docs/stripe.md
 */
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
/** 決済ページから戻る先（お店の独自ドメインから買ったときは、そのドメインへ戻す） */
export const APP_URL = "https://cook.iwakuni-design.com";
