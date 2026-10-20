// 写真から取り込みの「読み取る前の一覧」：撮る・選ぶ → 一覧で確かめる（消す・撮り直す）→ まとめて送る
// AI経理の useCaptureTray を流用。送り方（send）は呼ぶ側が決め、送り終わったら数を返す。
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteTrayItem, loadTray, saveTrayItem, type SendState, type TraySource } from "../lib/captureTray";

export interface TrayItem {
  id: string;
  file: File;
  url: string; // 小さく見せるための一時URL
  source: TraySource;
  state: SendState;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function useCaptureTray(orgId: string, send: (item: TrayItem) => Promise<void>) {
  const sendRef = useRef(send);
  sendRef.current = send;
  const [items, setItems] = useState<TrayItem[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 前に撮って読み取っていない写真を戻す（画面の読み込み直しや、途中で閉じたとき用）
  useEffect(() => {
    let alive = true;
    void loadTray(orgId).then((recs) => {
      if (!alive || !recs.length) return;
      const restored = recs.map((r) => {
        const file = new File([r.blob], r.name, { type: r.blob.type });
        return { id: r.id, file, url: URL.createObjectURL(file), source: r.source, state: "ready" as const };
      });
      setItems((cur) => [...restored.filter((r) => !cur.some((c) => c.id === r.id)), ...cur]);
    });
    return () => {
      alive = false;
    };
  }, [orgId]);

  // 画面を離れるとき一時URLを片付ける
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  const add = useCallback((files: File[], source: TraySource) => {
    const added = files.filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ id: newId(), file, url: URL.createObjectURL(file), source, state: "ready" as const }));
    setItems((cur) => [...cur, ...added]);
    added.forEach((a, i) => void saveTrayItem({ id: a.id, orgId, blob: a.file, name: a.file.name, source, addedAt: Date.now() + i }));
  }, [orgId]);

  const remove = useCallback((id: string) => {
    setItems((cur) => {
      const hit = cur.find((i) => i.id === id);
      if (hit) URL.revokeObjectURL(hit.url);
      return cur.filter((i) => i.id !== id);
    });
    void deleteTrayItem(id);
  }, []);

  /** 撮り直し：同じ場所の写真を入れ替える */
  const replace = useCallback((id: string, file: File) => {
    setItems((cur) => cur.map((i) => {
      if (i.id !== id) return i;
      URL.revokeObjectURL(i.url);
      return { ...i, file, url: URL.createObjectURL(file), state: "ready" };
    }));
    void loadTray(orgId).then((recs) => {
      const r = recs.find((x) => x.id === id);
      void saveTrayItem({ id, orgId, blob: file, name: file.name, source: r?.source ?? "camera", addedAt: r?.addedAt ?? Date.now() });
    });
  }, [orgId]);

  /** まだ送っていないもの・失敗したものを、順番に送る。送れなかった枚数を返す */
  const sendAll = useCallback(async (): Promise<number> => {
    const targets = itemsRef.current.filter((i) => i.state === "ready" || i.state === "failed");
    if (!targets.length) return 0;
    setSending(true);
    let failed = 0;
    const mark = (id: string, state: SendState) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, state } : i)));
    for (const [n, t] of targets.entries()) {
      setProgress(`${n + 1} / ${targets.length}枚目を送っています…`);
      mark(t.id, "sending");
      try {
        await sendRef.current(t);
        mark(t.id, "sent");
      } catch {
        failed++;
        mark(t.id, "failed");
      }
    }
    setProgress("");
    setSending(false);
    return failed;
  }, []);

  /** 読み取りまで済んだら一覧を空にする */
  const clearSent = useCallback(() => {
    setItems((cur) => {
      cur.filter((i) => i.state === "sent").forEach((i) => {
        URL.revokeObjectURL(i.url);
        void deleteTrayItem(i.id);
      });
      return cur.filter((i) => i.state !== "sent");
    });
  }, []);

  const waiting = items.filter((i) => i.state === "ready" || i.state === "failed").length;
  const failed = items.filter((i) => i.state === "failed").length;
  return { items, add, remove, replace, sendAll, clearSent, sending, progress, waiting, failed };
}
