// 店舗の基本：名前・目標の原価率・ラベルの製造者・推奨アレルゲンをラベルに書くか（管理者だけ変えられる）
import { useEffect, useState } from "react";
import type { Org } from "../../hooks/useOrg";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

export function StoreSection({ orgId, org, canManage }: { orgId: string; org: Org; canManage: boolean }) {
  const [name, setName] = useState(org.name);
  const [rate, setRate] = useState(String(Math.round(org.settings.targetCostRate * 1000) / 10));
  const [maker, setMaker] = useState(org.settings.manufacturer);
  const [rec, setRec] = useState(org.settings.includeRecommendedAllergens);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setName(org.name);
    setRate(String(Math.round(org.settings.targetCostRate * 1000) / 10));
    setMaker(org.settings.manufacturer);
    setRec(org.settings.includeRecommendedAllergens);
  }, [org.name, org.settings.targetCostRate, org.settings.manufacturer, org.settings.includeRecommendedAllergens]);

  async function save() {
    const r = Number(rate) / 100;
    if (!name.trim()) return setMsg("店舗名を入れてください。");
    if (!(r > 0 && r < 1)) return setMsg("原価率は1〜99%で入れてください。");
    try {
      await saveDoc(`organizations/${orgId}`, { name: name.trim().slice(0, 40), settings: { targetCostRate: r, manufacturer: maker.trim(), includeRecommendedAllergens: rec } });
      setMsg("保存しました。");
    } catch {
      setMsg("保存できませんでした。");
    }
  }

  return (
    <section className={`${ui.card} space-y-3`}>
      <h2 className="font-bold">お店<span className="ml-2 select-all font-mono text-[11px] font-normal text-faint">店舗ID {orgId}</span></h2>
      <fieldset disabled={!canManage} className="space-y-3">
        <label className="block space-y-1"><span className={ui.label}>店舗名</span><input className={ui.input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block space-y-1"><span className={ui.label}>目標の原価率（レシピで決めていないときに使う）</span>
          <span className="flex items-center gap-2"><input className={`${ui.input} w-24`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />%</span></label>
        <label className="block space-y-1"><span className={ui.label}>ラベルの製造者（名前と住所）</span>
          <textarea className={`${ui.input} h-16`} value={maker} maxLength={200} onChange={(e) => setMaker(e.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={rec} onChange={(e) => setRec(e.target.checked)} />
          <span>ラベルに推奨20品目のアレルゲン（アーモンド・大豆など）も書く<span className="block text-xs text-muted">義務の8品目は必ず書きます。推奨品目も書くのがおすすめです。</span></span>
        </label>
        {canManage && <button onClick={save} className={`w-full ${ui.primary}`}>保存する</button>}
      </fieldset>
      {!canManage && <p className="text-xs text-muted">変えられるのはオーナーと管理者です。</p>}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </section>
  );
}
