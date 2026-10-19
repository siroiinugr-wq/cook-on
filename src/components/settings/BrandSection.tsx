// 自社ブランド（ホワイトラベル）：アプリの表示名・ロゴ・テーマ色。ログイン画面とヘッダーに出る
import { useState } from "react";
import { DEFAULT_BRANDING, type Branding } from "@shared/types";
import { uploadLogo } from "../../lib/photos";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

const PRESETS = ["#d97757", "#8b5e3c", "#c2185b", "#2e7d32", "#1565c0", "#6d4c41", "#455a64"];

export function BrandSection({ orgId, brand }: { orgId: string; brand: Branding }) {
  const [b, setB] = useState<Branding>(brand);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (p: Partial<Branding>) => setB({ ...b, ...p });

  async function logo(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      set({ logoUrl: await uploadLogo(orgId, f) });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "ロゴを上げられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setMsg("");
    try {
      await saveDoc(`organizations/${orgId}/public/branding`, { appName: b.appName.trim().slice(0, 30) || DEFAULT_BRANDING.appName, logoUrl: b.logoUrl, primaryColor: b.primaryColor }, { merge: false, stamp: false });
      setMsg("保存しました。");
    } catch {
      setMsg("保存できませんでした。");
    }
  }

  return (
    <section className={`${ui.card} space-y-3`}>
      <h2 className="font-bold">ブランド（アプリの見た目）</h2>
      <label className="block space-y-1"><span className={ui.label}>アプリの名前（ログイン画面と画面の上に出ます）</span>
        <input className={ui.input} value={b.appName} maxLength={30} onChange={(e) => set({ appName: e.target.value })} /></label>
      <div className="space-y-1">
        <span className={ui.label}>ロゴ（正方形がきれいに出ます）</span>
        <div className="flex items-center gap-3">
          {b.logoUrl ? <img src={b.logoUrl} alt="" className="h-14 w-14 rounded-xl border border-line object-contain" /> : <span className="h-14 w-14 rounded-xl bg-sand" />}
          <label className={`${ui.secondary} cursor-pointer py-2 text-sm`}>{busy ? "上げています…" : "画像を選ぶ"}<input type="file" accept="image/*" className="hidden" onChange={(e) => logo(e.target.files?.[0])} /></label>
          {b.logoUrl && <button className={ui.quiet} onClick={() => set({ logoUrl: null })}>外す</button>}
        </div>
      </div>
      <div className="space-y-1">
        <span className={ui.label}>テーマ色（ボタンやアイコンの色）</span>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((c) => (
            <button key={c} onClick={() => set({ primaryColor: c })} aria-label={c} className={`h-8 w-8 rounded-full border-2 ${b.primaryColor === c ? "border-ink" : "border-paper"}`} style={{ background: c }} />
          ))}
          <input type="color" value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className="h-8 w-10 rounded" aria-label="ほかの色" />
        </div>
        <p className="text-xs text-muted">白い文字が読める、濃いめの色がおすすめです。</p>
      </div>
      <button onClick={save} disabled={busy} className={`w-full ${ui.primary}`}>保存する</button>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      <p className="text-xs text-muted">自社のドメイン（例：recipe.お店.jp）で開けるようにするには、運営にご連絡ください。</p>
    </section>
  );
}
