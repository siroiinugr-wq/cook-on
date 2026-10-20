// Firestore と Functions への入口を1か所にまとめる。
// .env.local が無いデモモードでは、同じ形のまま lib/demo.ts の「手元のデータ」と「にせの関数」で動く。
// 画面の部品は firebase を直接 import せず、ここの関数だけを使う（デモと本番で画面のコードを分けないため）。
import {
  collection, deleteDoc, doc, getDoc, limit as qLimit, onSnapshot, orderBy as qOrderBy, query, serverTimestamp, setDoc,
  updateDoc, where as qWhere, type QueryConstraint, type WhereFilterOp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions, isDemo } from "./firebase";
import { demoDelete, demoGet, demoListenCol, demoListenDoc, demoSet, demoUpdate } from "./demo";
import { demoCall } from "./demoFunctions";

export type Unsub = () => void;
export type WithId<T> = T & { id: string };
export interface ColOptions {
  where?: [string, WhereFilterOp, unknown][];
  orderBy?: [string, "asc" | "desc"];
  limit?: number;
}

/** Firestore の Timestamp・日付の文字列・数を Date にそろえる（表示用） */
export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate() : null;
}

export function listenDoc<T>(path: string, cb: (d: WithId<T> | null) => void, onError?: (e: Error) => void): Unsub {
  if (isDemo || !db) return demoListenDoc(path, cb as (d: unknown) => void);
  return onSnapshot(doc(db, path),
    (s) => cb(s.exists() ? ({ ...(s.data() as T), id: s.id }) : null),
    (e) => { console.error("listenDoc", path, e); onError?.(e); cb(null); });
}

/** 1回だけ読む（共有マスターの材料を店舗に写すときなど） */
export async function getOnce<T>(path: string): Promise<WithId<T> | null> {
  if (isDemo || !db) {
    const d = demoGet(path);
    return d ? ({ ...(d as T), id: path.split("/").pop() ?? "" }) : null;
  }
  const s = await getDoc(doc(db, path));
  return s.exists() ? ({ ...(s.data() as T), id: s.id }) : null;
}

export function listenCol<T>(path: string, cb: (list: WithId<T>[]) => void, opts: ColOptions = {}, onError?: (e: Error) => void): Unsub {
  if (isDemo || !db) return demoListenCol(path, cb as (l: unknown[]) => void, opts);
  const cs: QueryConstraint[] = [
    ...(opts.where ?? []).map(([f, op, v]) => qWhere(f, op, v)),
    ...(opts.orderBy ? [qOrderBy(opts.orderBy[0], opts.orderBy[1])] : []),
    ...(opts.limit ? [qLimit(opts.limit)] : []),
  ];
  return onSnapshot(query(collection(db, path), ...cs),
    (s) => cb(s.docs.map((d) => ({ ...(d.data() as T), id: d.id }))),
    (e) => { console.error("listenCol", path, e); onError?.(e); cb([]); });
}

/**
 * 画面から直接書ける場所（ルールで許したところ）だけに使う：材料・店舗の設定・ブランド・票。
 * stamp：updatedAt を付けるか。ブランドと票はルールで項目を限っているので false にする
 */
export async function saveDoc(path: string, data: Record<string, unknown>, o: { merge?: boolean; stamp?: boolean } = {}): Promise<void> {
  const merge = o.merge !== false;
  const stamp = o.stamp !== false;
  if (isDemo || !db) return demoSet(path, data, merge, stamp);
  await setDoc(doc(db, path), stamp ? { ...data, updatedAt: serverTimestamp() } : data, { merge });
}

export async function patchDoc(path: string, data: Record<string, unknown>): Promise<void> {
  if (isDemo || !db) return demoUpdate(path, data);
  await updateDoc(doc(db, path), data);
}

export async function removeDoc(path: string): Promise<void> {
  if (isDemo || !db) return demoDelete(path);
  await deleteDoc(doc(db, path));
}

/** 新しいドキュメントのID（保存する前に決めたいとき） */
export function newId(path: string): string {
  if (isDemo || !db) return `demo${Math.random().toString(36).slice(2, 12)}`;
  return doc(collection(db, path)).id;
}

/** Cloud Functions を呼ぶ。失敗したら日本語の一文の Error にする */
export async function call<T>(name: string, data: object): Promise<T> {
  if (isDemo || !functions) return demoCall<T>(name, data);
  try {
    return (await httpsCallable(functions, name, { timeout: 540_000 })(data)).data as T;
  } catch (e) {
    throw new Error(errorText(e));
  }
}

/** 画面に出すエラーの文。Functions からの日本語はそのまま、英語の決まり文句は言い換える */
export function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const msg = String(err?.message ?? "");
  if (/[ぁ-んァ-ン一-龥]/.test(msg)) return msg;
  if (/permission|insufficient/i.test(msg)) return "この操作の権限がありません。";
  if (/network|unavailable|offline/i.test(msg)) return "通信に失敗しました。接続を確かめてから、もう一度お試しください。";
  if (/deadline|timeout/i.test(msg)) return "時間がかかりすぎて止まりました。もう一度お試しください。";
  return "うまくいきませんでした。もう一度お試しください。";
}

/** AIを呼ぶときの受付番号。同じ操作の再送で二重にクレジットが引かれないよう、押すたびに1つ作る */
export function newRequestId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
