// 確認は共通のダイアログに統一（window.confirm は使わない）
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Ask { title: string; body: string; ok: string; cancel?: string }
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
