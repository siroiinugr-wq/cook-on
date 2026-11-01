// AI経理（別のアプリ）からの自動の受け取り。お店が COOK ON で「連携コード」を作り、AI経理の設定に貼ると、
// AI経理がレシートを承認するたびに、その明細（仕入れ明細ファイルと同じ形、shared/purchaseLines.ts）をここへ送ってくる。
// 受け取った明細は organizations/{orgId}/purchaseInbox に置くだけ。仕入れ値に反映するのは、画面で人が確かめてから。
// 連携コードはハッシュだけを linkCodes/{ハッシュ} に持つ（コードそのものは作ったときに1回だけ画面に出す）
import { createHash, randomBytes } from "node:crypto";
import { onCall, onRequest } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { REGION } from "../ai/config";
import { idOf, requireRole, ROLES } from "../core/auth";
import { cleanPurchaseLine, PURCHASE_SEND_MAX_LINES, type PurchaseLine } from "../shared/purchaseLines";

const hashOf = (code: string) => createHash("sha256").update(code).digest("hex");
/** 受け取って置いておく数の上限（読み込まれないまま増え続けないように） */
const INBOX_MAX = 300;

async function removeCodes(orgId: string) {
  const db = getFirestore();
  const old = await db.collection("linkCodes").where("orgId", "==", orgId).get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));
}

/** 連携コードを作る（作り直すと前のコードは使えなくなる） */
export const createLinkCode = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.ADMIN);
  await removeCodes(orgId);
  const code = `cookon-${randomBytes(24).toString("base64url")}`;
  const db = getFirestore();
  await db.doc(`linkCodes/${hashOf(code)}`).set({ orgId, app: "ai-accounting", createdAt: FieldValue.serverTimestamp() });
  await db.doc(`organizations/${orgId}`).set({ keiriLink: { createdAt: FieldValue.serverTimestamp(), lastAt: null, count: 0, sender: "" } }, { merge: true });
  return { code };
});

/** 連携をやめる（AI経理から送られてきても受け取らない） */
export const revokeLinkCode = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.ADMIN);
  await removeCodes(orgId);
  await getFirestore().doc(`organizations/${orgId}`).update({ keiriLink: FieldValue.delete() });
  return { ok: true };
});

/**
 * AI経理から明細を受け取る（POST JSON：{ code, sender, lines }）。lines が空ならつながるかの確認だけ（店舗名を返す）。
 * 同じレシート（ref）を送り直したら上書きする
 */
export const receivePurchaseLines = onRequest({ region: REGION, invoker: "public", cors: false, maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST だけです" }); return; }
  const body = (typeof req.body === "object" && req.body) || {};
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const db = getFirestore();
  const link = code.startsWith("cookon-") ? await db.doc(`linkCodes/${hashOf(code)}`).get() : null;
  const orgId = link?.exists ? String(link.get("orgId")) : "";
  if (!orgId) { res.status(401).json({ error: "連携コードが正しくありません。COOK ON の設定でコードを作り直してください。" }); return; }
  const orgRef = db.doc(`organizations/${orgId}`);

  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (raw.length > PURCHASE_SEND_MAX_LINES) { res.status(413).json({ error: `1回に送れるのは${PURCHASE_SEND_MAX_LINES}行までです` }); return; }
  const lines = raw.map(cleanPurchaseLine).filter((l: PurchaseLine | null): l is PurchaseLine => !!l);
  const sender = typeof body.sender === "string" ? body.sender.trim().slice(0, 60) : "";
  if (!raw.length) {
    res.json({ ok: true, store: String((await orgRef.get()).get("name") ?? "") });
    return;
  }

  const inbox = orgRef.collection("purchaseInbox");
  if ((await inbox.count().get()).data().count >= INBOX_MAX) {
    res.status(429).json({ error: "COOK ON に読み込まれていない明細がたまっています。COOK ON で読み込んでから送り直してください。" });
    return;
  }
  // レシートごとに1件。同じレシートは上書き（AI経理で直して承認し直したとき）
  const byRef = new Map<string, PurchaseLine[]>();
  for (const l of lines) byRef.set(l.ref || "_", [...(byRef.get(l.ref || "_") ?? []), l]);
  // まとめて書ける数の上限（Firestore の1回 500件）より少なく
  if (byRef.size > 400) { res.status(413).json({ error: "1回に送れるのは400枚までです" }); return; }
  const batch = db.batch();
  for (const [ref, ls] of byRef) {
    const doc = ref === "_" ? inbox.doc() : inbox.doc(`keiri_${hashOf(ref).slice(0, 32)}`);
    batch.set(doc, { lines: ls, sender, app: "ai-accounting", receivedAt: FieldValue.serverTimestamp() });
  }
  batch.update(orgRef, { "keiriLink.lastAt": FieldValue.serverTimestamp(), "keiriLink.count": FieldValue.increment(lines.length), "keiriLink.sender": sender });
  await batch.commit();
  res.json({ ok: true, received: lines.length });
});
