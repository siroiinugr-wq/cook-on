// 確認は共通のダイアログに統一（window.confirm は使わない）
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/** credits を付けると、使う量と残り（使う前 → 使ったあと）を大きく出す。balance が Infinity なら無制限 */
interface Ask { title: string; body: string; ok: string; cancel?: string; credits?: { use: number; balance: number } }
const Ctx = createContext<(a: Ask) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(Ask & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((a: Ask) => new Promise<boolean>((resolve) => setState({ ...a, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-t-2xl bg-paper p-5 sm:rounded-2xl">
            <h2 className="text-lg font-bold">{state.title}</h2>
            {state.credits && <CreditBox {...state.credits} />}
            <p className="mt-2 text-ink-soft">{state.body}</p>
            <div className="mt-5 flex gap-3">
              <button className="flex-1 rounded-xl border border-line-strong py-3" onClick={() => close(false)}>{state.cancel ?? "やめる"}</button>
              <button className="flex-1 rounded-xl bg-clay py-3 font-bold text-white" onClick={() => close(true)}>{state.ok}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** 使うクレジットと残り。足りないときは残りを赤で出す */
function CreditBox({ use, balance }: { use: number; balance: number }) {
  const free = balance === Infinity;
  const after = balance - use;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-sand p-3 text-center">
      <div>
        <dt className="text-xs text-muted">使う量</dt>
        <dd className="text-2xl font-bold">{use}<span className="ml-0.5 text-sm font-normal">クレジット</span></dd>
      </div>
      <div>
        <dt className="text-xs text-muted">残り</dt>
        <dd className={`text-2xl font-bold ${!free && after < 0 ? "text-ng" : ""}`}>
          {free ? "無制限" : <>{balance}<span className="mx-1 text-sm font-normal text-muted">→</span>{after}</>}
        </dd>
      </div>
      {free && <dd className="col-span-2 text-xs text-muted">このお店は無制限なので、残りは減りません。</dd>}
    </dl>
  );
}
