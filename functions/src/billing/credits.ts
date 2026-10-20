// クレジットの購入と付与（設計書 ②）
// Stripe は土台だけ。BILLING_ENABLED を true にするまで購入は「準備中」と返す。
// 有効にするときの手順は SETUP.md の「Stripe をつなぐ」。Webhook を受けた関数だけが addCredits で残高を足す。
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { BILLING_ENABLED, REGION, STAFF_EMAILS } from "../ai/config";
import { idOf, requireRole, ROLES } from "../core/auth";
import { addCredits } from "../core/credits";
import { CREDIT_PACKS } from "../shared/credits";

export const createCheckout = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.ADMIN);
  const pack = CREDIT_PACKS.find((p) => p.id === req.data?.packId);
  if (!pack) throw new HttpsError("invalid-argument", "選べないプランです。");
  if (!BILLING_ENABLED) throw new HttpsError("failed-precondition", "クレジットの購入は準備中です。もうしばらくお待ちください。");
  // ここに Stripe Checkout のセッション作成が入る（metadata に orgId と packId を入れ、Webhook で受け取る）
  throw new HttpsError("unimplemented", "購入の準備中です。");
});

/** 運営スタッフが店舗にクレジットを付ける（テスト・おわび用）。STAFF_EMAILS に入っている人だけ */
export const grantCredits = onCall({ region: REGION }, async (req) => {
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  const staff = STAFF_EMAILS.value().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!req.auth || req.auth.token.email_verified !== true || !staff.includes(email)) {
    throw new HttpsError("permission-denied", "この操作の権限がありません。");
  }
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const amount = Math.floor(Number(req.data?.amount));
  if (!(amount > 0 && amount <= 10000)) throw new HttpsError("invalid-argument", "付けられるのは1〜10,000クレジットです。");
  await addCredits(orgId, amount, "grant", { by: email, note: String(req.data?.note ?? "").slice(0, 100) });
  return { ok: true };
});
