// 撮ったけれどまだ読み取っていない写真の置き場（ブラウザの IndexedDB、端末ごと・店舗ごと）。AI経理の撮影の仕組みを流用。
// iPhone の Safari はカメラを使ったあと画面を読み込み直すことがあるので、撮った写真をメモリだけに持たず、
// ここに入れておく。送り終わったものは消す。保存できない環境（プライベートブラウズなど）でも撮影・読み取りはできる。

export type TraySource = "camera" | "upload";

export interface TrayRecord {
  id: string;
  orgId: string;
  blob: Blob;
  name: string;
  source: TraySource;
  addedAt: number;
}

const DB = "cook-on-capture", STORE = "tray";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** この店舗の、まだ読み取っていない写真（撮った順） */
export async function loadTray(orgId: string): Promise<TrayRecord[]> {
  try {
    const all = await run<TrayRecord[]>("readonly", (s) => s.getAll());
    return all.filter((r) => r.orgId === orgId).sort((a, b) => a.addedAt - b.addedAt);
  } catch {
    return [];
  }
}

export async function saveTrayItem(r: TrayRecord): Promise<void> {
  await run("readwrite", (s) => s.put(r)).catch(() => undefined);
}

export async function deleteTrayItem(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id)).catch(() => undefined);
}

/** 撮った写真の名前（拡張子は種類から） */
export function photoName(type: string, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ext = type === "image/png" ? "png" : "jpg";
  return `撮影_${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}_${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.${ext}`;
}

export type SendState = "ready" | "sending" | "sent" | "failed";
