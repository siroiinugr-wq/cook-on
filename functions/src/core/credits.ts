// クレジットの「仮押さえ → 確定／返金」（設計書 ②）
//
// 1. 受付番号（requestId）で二重請求を防ぐ：同じ番号の2回目は、1回目の結果を返すだけ
// 2. 仮押さえ：トランザクションの中で「残高を読む→足りれば引く→通帳に hold を書く」を一度に行う。
//    同時に10回押されても、残高より多くは引けない
// 3. AIを呼ぶ
// 4. 成功：通帳を spent にする（一部だけ成功なら、使わなかった分を返す）／失敗：全額返して refunded にする
//
// 画面から送られた金額は使わない。消費量は shared/credits.ts の CREDIT_COST からここで計算する。

import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type Transaction } from "firebase-admin/firestore";
import { CREDIT_COST, type CreditAction } from "../shared/credits";
import { costYen, GEMINI_MODEL, PROMPT_VERSION } from "../ai/config";
import type { Usage } from "../ai/gemini";

export interface Charge {
  orgId: string;
  uid: string;
  action: CreditAction;
  /** 何単位使うか（取り込みなら分けた数、名寄せなら20件ごとの数） */
  units: number;
  requestId: string;
}

export interface WorkResult<T> {
  result: T;
  usage?: Usage;
  /** 実際に使った単位（一部が失敗した取り込みなど）。省略＝全部 */
  usedUnits?: number;
}

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function requestIdOf(v: unknown): string {
  const s = String(v ?? "");
  if (!REQUEST_ID.test(s)) throw new HttpsError("invalid-argument", "受付番号の形が正しくありません。画面を読み込み直してください。");
  return s;
}

/** 結果が大きすぎて受付票に残せないとき（取り込みは imports に保存するので id だけ返す） */
const MAX_STORED_RESULT = 200_000;

export async function runWithCredits<T>(c: Charge, work: () => Promise<WorkResult<T>>): Promise<T> {
  const db = getFirestore();
  const orgRef = db.doc(`organizations/${c.orgId}`);
  const reqRef = db.doc(`aiRequests/${c.orgId}_${c.requestId}`);
  const ledgerRef = orgRef.collection("creditLedger").doc();
  const unit = CREDIT_COST[c.action];
  const cost = unit * c.units;

  // ── 仮押さえ ──
  const replay = await db.runTransaction(async (tx) => {
    const [req, org] = await Promise.all([tx.get(reqRef), tx.get(orgRef)]);
    if (req.exists) {
      const r = req.data()!;
      if (r.status === "done") return { result: r.result as T };
      throw new HttpsError("already-exists", "同じ操作を処理しています。少し待ってから画面を確かめてください。");
    }
    if (!org.exists) throw new HttpsError("not-found", "店舗が見つかりません。");
    const balance = Number(org.data()?.credits ?? 0);
    if (balance < cost) {
      throw new HttpsError("resource-exhausted", `クレジットが足りません（残り${balance} / 必要${cost}）。クレジットの画面から追加できます。`);
    }
    tx.update(orgRef, { credits: FieldValue.increment(-cost) });
    tx.set(ledgerRef, {
      kind: "spend", action: c.action, amount: -cost, status: "held", uid: c.uid, requestId: c.requestId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(reqRef, {
      orgId: c.orgId, uid: c.uid, action: c.action, status: "running", ledgerId: ledgerRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    return null;
  });
  if (replay) return replay.result;

  // ── AIを呼ぶ ──
  let out: WorkResult<T>;
  try {
    out = await work();
  } catch (e) {
    await refund(c, cost, ledgerRef.path, reqRef.path, e);
    throw toHttpsError(e);
  }

  // ── 確定（使わなかった分は返す）──
  const used = Math.max(0, Math.min(c.units, out.usedUnits ?? c.units));
  const back = (c.units - used) * unit;
  const stored = JSON.stringify(out.result ?? null).length <= MAX_STORED_RESULT ? out.result : null;
  await db.runTransaction(async (tx: Transaction) => {
    if (back > 0) tx.update(orgRef, { credits: FieldValue.increment(back) });
    tx.update(ledgerRef, {
      status: "spent",
      amount: -(cost - back),
      ...(back > 0 ? { refunded: back } : {}),
      settledAt: FieldValue.serverTimestamp(),
    });
    // 原価（トークン数・円）は店舗が読める通帳には書かず、Functions だけが読む受付票に残す
    tx.update(reqRef, {
      status: "done", result: stored ?? null, settledAt: FieldValue.serverTimestamp(),
      usage: out.usage ?? null, costYen: out.usage ? costYen(out.usage) : null, model: GEMINI_MODEL, promptVersion: PROMPT_VERSION,
    });
  });
  return out.result;
}

/** 失敗したら全額返す。受付票は消して、同じ番号でもう一度押せるようにする */
async function refund(c: Charge, cost: number, ledgerPath: string, reqPath: string, e: unknown) {
  const db = getFirestore();
  console.warn("AIの処理に失敗したのでクレジットを返します", c.action, c.orgId, String((e as Error)?.message ?? e));
  try {
    await db.runTransaction(async (tx) => {
      tx.update(db.doc(`organizations/${c.orgId}`), { credits: FieldValue.increment(cost) });
      tx.update(db.doc(ledgerPath), {
        status: "refunded", amount: 0, refunded: cost, settledAt: FieldValue.serverTimestamp(),
      });
      tx.delete(db.doc(reqPath));
    });
  } catch (err) {
    // 返金に失敗したら記録だけ残す（通帳の held が残るので、あとで直せる）
    console.error("返金に失敗しました", c.orgId, ledgerPath, err);
  }
}

/** 画面に出す文は日本語の一文にする。AIの料金やトークンなど運営側の事情は書かない */
function toHttpsError(e: unknown): HttpsError {
  if (e instanceof HttpsError) return e;
  const msg = String((e as Error)?.message ?? e);
  if (/429|RESOURCE_EXHAUSTED/.test(msg)) return new HttpsError("unavailable", "混み合っています。少し時間をおいてお試しください。クレジットは使われていません。");
  return new HttpsError("internal", "うまく処理できませんでした。クレジットは使われていません。もう一度お試しください。");
}

/** 購入・付与でクレジットを足す（通帳にも書く） */
export async function addCredits(orgId: string, amount: number, kind: "purchase" | "grant", meta: Record<string, unknown>) {
  const db = getFirestore();
  const orgRef = db.doc(`organizations/${orgId}`);
  await db.runTransaction(async (tx) => {
    const org = await tx.get(orgRef);
    if (!org.exists) throw new HttpsError("not-found", "店舗が見つかりません。");
    tx.update(orgRef, { credits: FieldValue.increment(amount) });
    tx.set(orgRef.collection("creditLedger").doc(), {
      kind, amount, status: "done", ...meta, createdAt: FieldValue.serverTimestamp(),
    });
  });
}
