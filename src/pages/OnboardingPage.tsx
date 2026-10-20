// はじめに：店舗を作る（店舗名と、目標の原価率）。AI経理の OnboardingPage と同じ流れ
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_TARGET_RATE } from "@shared/cost";
import { auth } from "../lib/firebase";
import { call } from "../lib/store";
import { ui } from "../components/common/ui";

// onCreated：作った店舗を「いま開いている店舗」にする。canGoBack：2店舗目以降の追加ならトップへ戻れる
export function OnboardingPage({ onCreated, canGoBack = false }: { onCreated?: (orgId: string) => void; canGoBack?: boolean }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_TARGET_RATE * 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await call<{ orgId: string }>("createOrganization", { name: name.trim(), targetCostRate: Number(rate) / 100 });
      onCreated?.(r.orgId);
      // サーバー側で店舗の権限（クレーム）を付けたので、トークンを取り直すと画面が切り替わる
      await auth?.currentUser?.getIdToken(true);
      nav("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "店舗を作れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5 p-6">
      {canGoBack && <Link to="/settings" className="text-sm text-muted underline">設定に戻る</Link>}
      <h1 className="font-serif text-2xl">{canGoBack ? "店舗を追加する" : "はじめに：お店の名前"}</h1>
      <label className="block space-y-1">
        <span className={ui.label}>店舗名（ラベルの製造者にも使います。あとで変えられます）</span>
        <input className={ui.input} placeholder="例：パティスリー〇〇" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <label className="block space-y-1">
        <span className={ui.label}>目標の原価率（売値に対する材料費の割合）</span>
        <div className="flex items-center gap-2">
          <input className={`${ui.input} w-28`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />
          <span>%</span>
        </div>
        <span className="text-xs text-muted">お菓子なら25〜35%がよくある目安です。超えたレシピにお知らせが出ます。</span>
      </label>
      {error && <p className="text-ng">{error}</p>}
      <button disabled={!name.trim() || busy} onClick={create} className={`sticky bottom-4 w-full ${ui.primary}`}>
        {busy ? "作っています…" : "はじめる"}
      </button>
    </div>
  );
}
