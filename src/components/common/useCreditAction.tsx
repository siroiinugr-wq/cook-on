// クレジットを使う操作の共通の流れ（設計書 ③「費用は先に見せる」）
// 押す → 確認のポップアップ（使う量と残り）→ 足りなければクレジットの画面へ案内 → 受付番号を付けて実行 → 終わったら使った量と残りを下に出す
// 費用は警告色にせず太字で伝える。断られたときの文はサーバーの日本語をそのまま出す
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useOrgCtx } from "../../contexts/OrgContext";
import { useConfirm } from "./ConfirmDialog";

interface Done { title: string; before: number; planned: number; at: number }
const ToastCtx = createContext<(d: Done) => void>(() => undefined);

/** 終わったあとのお知らせ。残りはお店のデータ（使わなかった分は戻ったあと）をそのまま読むので、実際に使った量が出る */
export function CreditToastProvider({ children }: { children: ReactNode }) {
  const { org } = useOrgCtx();
  const [done, setDone] = useState<Done | null>(null);
  // 残高の反映は少し遅れて届くので、変わるか2.5秒たつまでは「確かめています」と出す
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!done) return;
    setSettled(false);
    const s = setTimeout(() => setSettled(true), 2500);
    const t = setTimeout(() => setDone(null), 8000);
    return () => { clearTimeout(s); clearTimeout(t); };
  }, [done]);
  useEffect(() => { if (done && org.credits !== done.before) setSettled(true); }, [org.credits, done]);
  const free = org.credits === Infinity;
  const used = done ? Math.max(0, Math.min(done.planned, done.before - org.credits)) : 0;
  return (
    <ToastCtx.Provider value={setDone}>
      {children}
      {done && (
        <button type="button" onClick={() => setDone(null)} role="status"
          className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-left text-sm text-white shadow-lg">
          <span className="block font-bold">✓ {done.title}</span>
          <span className="block text-white/80">
            {free ? `${done.planned}クレジット分（無制限のお店なので、残りは減っていません）` : !settled ? "使った量と残りを確かめています…" : `${used}クレジット使いました・残り ${org.credits}${used < done.planned ? `（使わなかった${done.planned - used}クレジットは戻しました）` : ""}`}
          </span>
        </button>
      )}
    </ToastCtx.Provider>
  );
}

export function useCreditAction(balance: number) {
  const confirm = useConfirm();
  const nav = useNavigate();
  const toast = useContext(ToastCtx);
  return async function run<T>(o: { title: string; credits: number; detail?: string; exec: () => Promise<T> }): Promise<T | null> {
    if (balance < o.credits) {
      const go = await confirm({
        title: "クレジットが足りません",
        body: `「${o.title}」には ${o.credits} クレジット必要です。クレジットの画面で追加できます。`,
        ok: "クレジットの画面へ", credits: { use: o.credits, balance },
      });
      if (go) nav("/credits");
      return null;
    }
    // 無制限の店舗（残高が Infinity）も、どれだけ使う操作かは見せる
    const ok = await confirm({
      title: o.title,
      body: `${o.detail ?? ""}うまくいかなかったときは使われません。`,
      ok: balance === Infinity ? "実行する" : `${o.credits} クレジットで実行`, credits: { use: o.credits, balance },
    });
    if (!ok) return null;
    const r = await o.exec();
    toast({ title: o.title, before: balance, planned: o.credits, at: Date.now() });
    return r;
  };
}
