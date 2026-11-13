// 購入の知らせ（Stripe の決済ページの結果）から「どの店舗に何クレジット渡すか」を決める。
// Webhook（billing/stripe.ts）だけが使う。判定をここに分けてあるのは、テストで確かめるため。
import { CREDIT_PACKS } from "./credits";

/** Stripe の Checkout セッションのうち、判定に使う所だけ */
export interface PaidSession {
  id?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
}

export type PurchaseDecision =
  | { grant: true; orgId: string; sessionId: string; packId: string; credits: number; priceYen: number }
  | { grant: false; reason: string };

/**
 * 渡してよいのは：COOK ON の決済で、払い終わっていて（コンビニ・振込は決済ページを通っただけでは未払い）、
 * 金額が今のまとめ買いの値段と同じとき。どれか違えば渡さず、理由を返す（ログに残す）
 */
export function decidePurchase(s: PaidSession): PurchaseDecision {
  const meta = s.metadata ?? {};
  if (meta.app !== "cookon") return { grant: false, reason: "COOK ON の決済ではない" };
  if (s.payment_status !== "paid") return { grant: false, reason: `まだ支払い前（${s.payment_status ?? "不明"}）` };
  const orgId = String(meta.orgId ?? "");
  const sessionId = String(s.id ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orgId) || !/^[A-Za-z0-9_]{1,200}$/.test(sessionId)) return { grant: false, reason: "店舗か決済IDが分からない" };
  const pack = CREDIT_PACKS.find((p) => p.id === meta.packId);
  if (!pack) return { grant: false, reason: `まとめ買いが見つからない（${meta.packId ?? ""}）` };
  if (String(s.currency ?? "").toLowerCase() !== "jpy" || s.amount_total !== pack.priceYen) {
    return { grant: false, reason: `金額が合わない（${s.amount_total} ${s.currency}）` };
  }
  return { grant: true, orgId, sessionId, packId: pack.id, credits: pack.credits, priceYen: pack.priceYen };
}
