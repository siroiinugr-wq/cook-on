// クレジットの購入と付与（設計書 ②。Stripe の設定と手順は docs/stripe.md）
//
// 画面のボタン → createCheckout が Stripe の決済ページを作る → 支払いが済むと Stripe が stripeWebhook（billing/stripe.ts）に知らせる
// → そこでだけ残高を足す。決済ページから戻ってきたこと（success_url）は支払いの証拠にしない。
// 値段とクレジット数は shared/credits.ts の CREDIT_PACKS の1か所だけ（Stripe 側に商品は作らず、その場で金額を渡す）。
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import { APP_URL, REGION, STAFF_EMAILS, STRIPE_SECRET_KEY } from "../ai/config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { addCredits } from "../core/credits";
import { CREDIT_PACKS } from "../shared/credits";

function staffEmails(): string[] {
  return STAFF_EMAILS.value().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** 戻る先。お店の独自ドメイン（tenantDomains にあるもの）から来たときだけ、そのドメインへ戻す */
async function returnBase(origin: unknown): Promise<string> {
  const m = /^https:\/\/([a-z0-9.-]{1,200})$/.exec(String(origin ?? ""));
  if (!m || `https://${m[1]}` === APP_URL) return APP_URL;
  const known = await getFirestore().doc(`tenantDomains/${m[1]}`).get();
  return known.exists ? `https://${m[1]}` : APP_URL;
}

export const createCheckout = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.ADMIN);
  requireVerified(req.auth);
  const pack = CREDIT_PACKS.find((p) => p.id === req.data?.packId);
  if (!pack) throw new HttpsError("invalid-argument", "選べないプランです。");
  const key = STRIPE_SECRET_KEY.value();
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  // テストの鍵が入っている間は、運営スタッフだけが試せる（お店がテストカードでクレジットを増やせないように）
  if (!/^(rk|sk)_live_/.test(key) && !staffEmails().includes(email)) {
    throw new HttpsError("failed-precondition", "クレジットの購入は準備中です。もうしばらくお待ちください。");
  }
  const base = await returnBase(req.rawRequest?.headers?.origin);
  const session = await new Stripe(key).checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: { currency: "jpy", unit_amount: pack.priceYen, product_data: { name: `COOK ON クレジット ${pack.credits.toLocaleString("ja-JP")}` } },
    }],
    // Webhook はこの3つで「どの店舗に・どのまとめ買いを」渡すか決める
    metadata: { app: "cookon", orgId, packId: pack.id, uid },
    client_reference_id: orgId,
    ...(email ? { customer_email: email } : {}),
    locale: "ja",
    success_url: `${base}/credits?paid=1`,
    cancel_url: `${base}/credits`,
  });
  if (!session.url) throw new HttpsError("internal", "決済ページを作れませんでした。少し待ってからもう一度お試しください。");
  return { url: session.url };
});

/** 運営スタッフが店舗にクレジットを付ける（テスト・おわび用）。STAFF_EMAILS に入っている人だけ */
export const grantCredits = onCall({ region: REGION }, async (req) => {
  const email = String(req.auth?.token.email ?? "").toLowerCase();
  if (!req.auth || req.auth.token.email_verified !== true || !staffEmails().includes(email)) {
    throw new HttpsError("permission-denied", "この操作の権限がありません。");
  }
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const amount = Math.floor(Number(req.data?.amount));
  if (!(amount > 0 && amount <= 10000)) throw new HttpsError("invalid-argument", "付けられるのは1〜10,000クレジットです。");
  await addCredits(orgId, amount, "grant", { by: email, note: String(req.data?.note ?? "").slice(0, 100) });
  return { ok: true };
});
