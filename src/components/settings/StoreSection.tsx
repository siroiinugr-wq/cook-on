// 店舗の基本：名前・目標の原価率・ラベルの製造者・推奨アレルゲンをラベルに書くか・既製品をみんなと共有するか（管理者だけ変えられる）
import { useEffect, useState } from "react";
import type { Org } from "../../hooks/useOrg";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

export function StoreSection({ orgId, org, canManage }: { orgId: string; org: Org; canManage: boolean }) {
  const [name, setName] = useState(org.name);
  const [rate, setRate] = useState(String(Math.round(org.settings.targetCostRate * 1000) / 10));
  const [maker, setMaker] = useState(org.settings.manufacturer);
  const [address, setAddress] = useState(org.settings.manufacturerAddress);
  const [rec, setRec] = useState(org.settings.includeRecommendedAllergens);
  const [share, setShare] = useState(org.settings.shareProducts === true);
  const [shareIng, setShareIng] = useState(org.settings.shareIngredients);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setName(org.name);
    setRate(String(Math.round(org.settings.targetCostRate * 1000) / 10));
    setMaker(org.settings.manufacturer);
    setAddress(org.settings.manufacturerAddress);
    setRec(org.settings.includeRecommendedAllergens);
    setShare(org.settings.shareProducts === true);
    setShareIng(org.settings.shareIngredients);
  }, [org.name, org.settings.targetCostRate, org.settings.manufacturer, org.settings.manufacturerAddress, org.settings.includeRecommendedAllergens, org.settings.shareProducts, org.settings.shareIngredients]);

  async function save() {
    const r = Number(rate) / 100;
    if (!name.trim()) return setMsg("店舗名を入れてください。");
    if (!(r > 0 && r < 1)) return setMsg("原価率は1〜99%で入れてください。");
    if (!maker.trim() || !address.trim()) return setMsg("ラベルの製造者は、名前と住所の両方を入れてください（食品表示に必要です）。");
    try {
      await saveDoc(`organizations/${orgId}`, { name: name.trim().slice(0, 40), settings: { ...org.settings, targetCostRate: r, manufacturer: maker.trim(), manufacturerAddress: address.trim(), includeRecommendedAllergens: rec, shareProducts: share || (org.settings.shareProducts === null ? null : false), shareIngredients: shareIng } });
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
        <label className="block space-y-1"><span className={ui.label}>ラベルの製造者の名前（必須）</span>
          <input className={ui.input} value={maker} maxLength={60} placeholder="例：株式会社イム" onChange={(e) => setMaker(e.target.value)} /></label>
        <label className="block space-y-1"><span className={ui.label}>製造者の住所（必須・食品表示に必要です）</span>
          <input className={ui.input} value={address} maxLength={140} placeholder="例：山口県岩国市〇〇町1-2-3" onChange={(e) => setAddress(e.target.value)} />
          {!address.trim() && <span className="block text-xs text-warn-strong">住所が入るまで、ラベルは印刷できません。</span>}</label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={rec} onChange={(e) => setRec(e.target.checked)} />
          <span>ラベルに推奨20品目のアレルゲン（アーモンド・大豆など）も書く<span className="block text-xs text-muted">義務の8品目は必ず書きます。推奨品目も書くのがおすすめです。</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>登録した既製品を、みんなの既製品データベースにも入れる<span className="block text-xs text-muted">ほかのお店の確認が集まると、どのお店でも材料の候補に出ます。お店の名前は出ません。外すと、お店の材料にだけ入ります。</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={shareIng} onChange={(e) => setShareIng(e.target.checked)} />
          <span>確かめた材料の情報を、共有の材料づくりに提案する<span className="block text-xs text-muted">アレルゲンを確かめた材料の呼び方・アレルゲン・仕入れ値を、COOK ON の運営に提案します。運営が確かめたものだけが共有の材料に入り、仕入れ値はほかのお店に「参考価格」（目安）として出ます。お店の名前と仕入れ先は出ません。</span></span>
        </label>
        {canManage && <button onClick={save} className={`w-full ${ui.primary}`}>保存する</button>}
      </fieldset>
      {!canManage && <p className="text-xs text-muted">変えられるのはオーナーと管理者です。</p>}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </section>
  );
}
