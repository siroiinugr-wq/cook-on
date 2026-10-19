// AIまわりの定数はここ1か所だけ（設計書 ④）
import { defineSecret, defineString } from "firebase-functions/params";

export const REGION = "asia-northeast1";

/**
 * COOK ON はすべて軽量版。1クレジット（10円）あたりのAPI原価を1〜2円に収めるため。
 * AI経理（ai-accounting）と同じモデル名。モデルが終わるときはここだけ直す。
 */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * 料金の目安（100万トークンあたりのドル）。通帳（creditLedger）に1回ごとの円を残すのに使う。
 * AI経理の config.ts と同じ仮の値（公式の数字は未確認）。Google AI Studio の料金ページで確かめてここだけ直す。
 */
export const GEMINI_PRICE_USD = { in: 0.25, out: 1.25 };
export const USD_JPY = 150;

export function costYen(usage: { in?: number; out?: number }): number {
  const usd = ((usage.in ?? 0) * GEMINI_PRICE_USD.in + (usage.out ?? 0) * GEMINI_PRICE_USD.out) / 1_000_000;
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

/** Stripe での購入。準備ができるまで false（true にするのは Stripe の鍵を登録してから） */
export const BILLING_ENABLED = false;
