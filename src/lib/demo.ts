// デモモードの「手元のデータベース」。Firestore と同じパスで読み書きでき、ブラウザに覚える（読み込み直しても残る）。
// Firebase をつなぐ前でも、画面の流れ（AIのクレジット消費・取り込みのプレビューまで）を一通り試せるようにするため。
import type { ColOptions } from "./store";
import { seedDemo } from "./demoData";

type Doc = Record<string, unknown>;
const KEY = "cookon-demo-v1";
let data: Map<string, Doc> = load();
const listeners = new Set<() => void>();

function load(): Map<string, Doc> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Map(JSON.parse(raw) as [string, Doc][]);
  } catch {
    // 読めなければ最初のデータから
  }
  return new Map(seedDemo());
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...data.entries()]));
  } catch {
    // 覚えられなくても、開いている間は動く
  }
}

function notify() {
  persist();
  // 呼んだ側の処理が終わってから知らせる（Firestore の onSnapshot と同じく非同期に）
  queueMicrotask(() => listeners.forEach((f) => f()));
}

/** デモのデータを最初の状態に戻す（設定画面から） */
export function resetDemo() {
  data = new Map(seedDemo());
  notify();
}

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const idOf = (path: string) => path.split("/").pop() ?? "";
const now = () => new Date().toISOString();

export function demoGet(path: string): Doc | null {
  const d = data.get(path);
  return d ? structuredClone(d) : null;
}

export function demoListDocs(colPath: string): { id: string; data: Doc }[] {
  return [...data.entries()].filter(([p]) => parentOf(p) === colPath).map(([p, d]) => ({ id: idOf(p), data: structuredClone(d) }));
}

export function demoListenDoc(path: string, cb: (d: unknown) => void) {
  const run = () => {
    const d = demoGet(path);
    cb(d ? { ...d, id: idOf(path) } : null);
  };
  listeners.add(run);
  queueMicrotask(run);
  return () => void listeners.delete(run);
}

export function demoListenCol(path: string, cb: (l: unknown[]) => void, opts: ColOptions = {}) {
  const run = () => {
    let list = demoListDocs(path).map((x) => ({ ...x.data, id: x.id })) as Doc[];
    for (const [f, op, v] of opts.where ?? []) {
      list = list.filter((d) => {
        const x = d[f];
        if (op === "==") return x === v || (v === false && x === undefined);
        if (op === "!=") return x !== v;
        if (op === "array-contains") return Array.isArray(x) && x.includes(v);
        if (op === "in") return Array.isArray(v) && v.includes(x);
        return true;
      });
    }
    if (opts.orderBy) {
      const [f, dir] = opts.orderBy;
      list.sort((a, b) => String(a[f] ?? "").localeCompare(String(b[f] ?? "")) * (dir === "desc" ? -1 : 1));
    }
    cb(opts.limit ? list.slice(0, opts.limit) : list);
  };
  listeners.add(run);
  queueMicrotask(run);
  return () => void listeners.delete(run);
}

/** 書き込みのあとに、本番の Functions のトリガの代わりをする処理（demoFunctions.ts が登録する） */
type Trigger = (path: string, before: Doc | null, after: Doc | null) => void;
const triggers: Trigger[] = [];
export function onDemoWrite(t: Trigger) {
  triggers.push(t);
}

export function demoWrite(path: string, after: Doc | null, runTriggers = true) {
  const before = demoGet(path);
  if (after) data.set(path, after);
  else data.delete(path);
  if (runTriggers) triggers.forEach((t) => t(path, before, after));
  notify();
}

export async function demoSet(path: string, d: Doc, merge: boolean, stamp = true) {
  const cur = merge ? demoGet(path) ?? {} : {};
  demoWrite(path, { ...cur, ...d, ...(stamp ? { updatedAt: now() } : {}) });
}

export async function demoUpdate(path: string, d: Doc) {
  const cur = demoGet(path);
  if (!cur) throw new Error("見つかりません。");
  demoWrite(path, { ...cur, ...d });
}

export async function demoDelete(path: string) {
  demoWrite(path, null);
}

