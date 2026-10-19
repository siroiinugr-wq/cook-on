// Firestore（デモでは手元のデータ）を読み続ける共通の hook。画面を離れたら自動で止める
import { useEffect, useState } from "react";
import { listenCol, listenDoc, type ColOptions, type WithId } from "../lib/store";

export function useCol<T>(path: string | null, opts: ColOptions = {}): { list: WithId<T>[]; loading: boolean; error: string } {
  const [state, setState] = useState<{ list: WithId<T>[]; loading: boolean; error: string }>({ list: [], loading: true, error: "" });
  const key = JSON.stringify(opts);
  useEffect(() => {
    if (!path) return setState({ list: [], loading: false, error: "" });
    setState((s) => ({ ...s, loading: true }));
    return listenCol<T>(path, (list) => setState({ list, loading: false, error: "" }), JSON.parse(key) as ColOptions,
      () => setState({ list: [], loading: false, error: "読み込めませんでした。権限が無いか、通信が切れています。" }));
  }, [path, key]);
  return state;
}

export function useDoc<T>(path: string | null): { data: WithId<T> | null; loading: boolean } {
  const [state, setState] = useState<{ data: WithId<T> | null; loading: boolean }>({ data: null, loading: true });
  useEffect(() => {
    if (!path) return setState({ data: null, loading: false });
    setState((s) => ({ ...s, loading: true }));
    return listenDoc<T>(path, (data) => setState({ data, loading: false }));
  }, [path]);
  return state;
}
