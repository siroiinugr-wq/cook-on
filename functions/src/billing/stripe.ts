// Stripe からの知らせ（Webhook）。クレジットを足すのはここだけ。
// ・署名を確かめる（Stripe 以外からの呼び出しは受けない）
// ・払い終わったときだけ渡す（カードはその場、コンビニ・振込は async_payment_succeeded が来てから）
// ・決済IDごとに purchases/{決済ID} を残し、同じ知らせが再送されても二度渡さない
import { onRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import { REGION, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "../ai/config";
import { decidePurchase, type PaidSession } from "../shared/purchase";

/** 払い終わった決済のクレジットを足す。足したら true、渡し済み・渡せないなら false */
export async function grantPurchase(session: PaidSession): Promise<boolean> {
  const d = decidePurchase(session);
  if (!d.grant) {
    console.log("クレジットを渡さない決済:", session.id, d.reason);
    return false;
  }
  const db = getFirestore();
  const orgRef = db.doc(`organizations/${d.orgId}`);
  const logRef = orgRef.collection("purchases").doc(d.sessionId);
  const done = await db.runTransaction(async (tx) => {
    const [log, org] = await Promise.all([tx.get(logRef), tx.get(orgRef)]);
    if (log.exists) return false;
    if (!org.exists) throw new Error(`店舗が見つかりません: ${d.orgId}`);
    tx.set(logRef, { packId: d.packId, credits: d.credits, priceYen: d.priceYen, uid: session.metadata?.uid ?? null, createdAt: FieldValue.serverTimestamp() });
    tx.update(orgRef, { credits: FieldValue.increment(d.credits) });
    tx.set(orgRef.collection("creditLedger").doc(), {
      kind: "purchase", amount: d.credits, status: "done", packId: d.packId, priceYen: d.priceYen, createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  console.log(done ? "クレジットを追加:" : "渡し済みなので飛ばす:", d.orgId, d.credits, d.sessionId);
  return done;
}

export const stripeWebhook = onRequest(
  { region: REGION, invoker: "public", cors: false, maxInstances: 5, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    let event: Stripe.Event;
    try {
      event = new Stripe(STRIPE_SECRET_KEY.value()).webhooks.constructEvent(req.rawBody, String(req.headers["stripe-signature"] ?? ""), STRIPE_WEBHOOK_SECRET.value());
    } catch (e) {
      console.error("Webhook の署名を確認できませんでした:", String((e as Error)?.message ?? e));
      res.status(400).send("bad signature");
      return;
    }
    try {
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        await grantPurchase(event.data.object as PaidSession);
      } else if (event.type === "checkout.session.async_payment_failed") {
        console.log("支払い期限切れなど:", event.data.object.id);
      }
    } catch (e) {
      // 500 を返すと Stripe があとで送り直してくれる
      console.error("Webhook の処理に失敗:", event.type, String((e as Error)?.message ?? e));
      res.status(500).send("handler error");
      return;
    }
    res.status(200).send("ok");
  },
);
