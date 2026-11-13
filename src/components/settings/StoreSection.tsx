// 店舗の基本：名前・目標の原価率・ラベルの製造者・推奨アレルゲンをラベルに書くか・既製品をみんなと共有するか（管理者だけ変えられる）
import { useEffect, useState } from "react";
import type { Org } from "../../hooks/useOrg";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";
import { numText } from "../../lib/num";

export function StoreSection({ orgId, org, canManage }: { orgId: string; org: Org; canManage: boolean }) {
  const [name, setName] = useState(org.name);
  const [rate, setRate] = useState(String(Math.round(org.settings.targetCostRate * 1000) / 10));
  const [maker, setMaker] = useState(org.settings.manufacturer);
  const [address, setAddress] = useState(org.settings.manufacturerAddress);
  const [rec, setRec] = useState(org.settings.includeRecommendedAllergens);
  const [share, setShare] = useState(org.settings.shareProducts === true);
  const [shareIng, setShareIng] = useState(org.settings.shareIngredients);
  const [kind, setKind] = useState(org.settings.labelExpiryKind);
  const [days, setDays] = useState(String(org.settings.labelExpiryDays));
  const [storage, setStorage] = useState(org.settings.labelStorage);
  const [outside, setOutside] = useState(org.settings.labelDateOutside);
  const [datePrint, setDatePrint] = useState(org.settings.labelDatePrint);
  const [nutrition, setNutrition] = useState(org.settings.labelNutrition);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setKind(org.settings.labelExpiryKind);
    setDays(String(org.settings.labelExpiryDays));
    setStorage(org.settings.labelStorage);
    setOutside(org.settings.labelDateOutside);
    setDatePrint(org.settings.labelDatePrint);
    setNutrition(org.settings.labelNutrition);
  }, [org.settings.labelNutrition, org.settings.labelExpiryKind, org.settings.labelExpiryDays, org.settings.labelStorage, org.settings.labelDateOutside, org.settings.labelDatePrint]);
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
      await saveDoc(`organizations/${orgId}`, { name: name.trim().slice(0, 40), settings: { ...org.settings, targetCostRate: r, manufacturer: maker.trim(), manufacturerAddress: address.trim(), includeRecommendedAllergens: rec, shareProducts: share || (org.settings.shareProducts === null ? null : false), shareIngredients: shareIng,
        labelExpiryKind: kind, labelExpiryDays: Math.max(1, Math.min(3650, Number(days) || 7)), labelStorage: storage.trim().slice(0, 120), labelDateOutside: outside, labelDatePrint: datePrint, labelNutrition: nutrition } });
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
          <span className="flex items-center gap-2"><input className={`${ui.input} w-24`} inputMode="decimal" value={rate} onChange={(e) => setRate(numText(e.target.value))} />%</span></label>
        <label className="block space-y-1"><span className={ui.label}>ラベルの製造者の名前（必須）</span>
          <input className={ui.input} value={maker} maxLength={60} placeholder="例：株式会社イム" onChange={(e) => setMaker(e.target.value)} /></label>
        <label className="block space-y-1"><span className={ui.label}>製造者の住所（必須・食品表示に必要です）</span>
          <input className={ui.input} value={address} maxLength={140} placeholder="例：山口県岩国市〇〇町1-2-3" onChange={(e) => setAddress(e.target.value)} />
          {!address.trim() && <span className="block text-xs text-warn-strong">住所が入るまで、ラベルは印刷できません。</span>}</label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={rec} onChange={(e) => setRec(e.target.checked)} />
          <span>ラベルに推奨20品目のアレルゲン（アーモンド・大豆など）も書く<span className="block text-xs text-muted">義務の8品目は必ず書きます。推奨品目も書くのがおすすめです。</span></span>
        </label>
        <div className="space-y-2 rounded-xl bg-sand/60 p-3">
          <p className="text-sm font-bold">ラベルの初期値<span className="ml-1 text-xs font-normal text-muted">（レシピごとに覚えた値があれば、そちらを使います）</span></p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className={ui.label}>期限の種類</span>
              <select className={ui.input} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option>賞味期限</option><option>消費期限</option></select></label>
            <label className="space-y-1"><span className={ui.label}>製造日から何日</span>
              <input className={ui.input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></label>
          </div>
          <p className="text-xs text-muted">消費期限＝傷みやすいもの（生菓子・サンドイッチなど、おおむね5日以内）。賞味期限＝おいしく食べられる期限（焼菓子・コーヒー豆など）。</p>
          <label className="block space-y-1"><span className={ui.label}>保存方法</span>
            <input className={ui.input} value={storage} maxLength={120} placeholder="直射日光・高温多湿を避けて保存してください" onChange={(e) => setStorage(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={outside} onChange={(e) => setOutside(e.target.checked)} />
            <span>期限の日付は枠の外に書く<span className="block text-xs text-muted">枠の中は「枠外下部に記載」になります。同じラベルを何日も使えます。</span></span>
          </label>
          {outside && (
            <label className="ml-7 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={datePrint} onChange={(e) => setDatePrint(e.target.checked)} />
              <span>枠の外の日付も印刷する<span className="block text-xs text-muted">外すと日付は空けておきます（日付スタンプや手書き用）。</span></span>
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-clay" checked={nutrition} onChange={(e) => setNutrition(e.target.checked)} />
            <span>栄養成分表示（熱量・たんぱく質・脂質・炭水化物・食塩相当量）を入れる
              <span className="block text-xs text-muted">材料の成分表から計算した推定値を「（推定値）」と書いて入れます。レシピごとにも外せます。</span>
            </span>
          </label>
          {!nutrition && <NutritionExempt />}
        </div>
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

/** 栄養成分表示を省略できる場合（食品表示基準。消費者庁・各都道府県の手引き）。外すときに読んでもらう */
export function NutritionExempt() {
  return (
    <div className="ml-7 space-y-1 rounded-lg bg-warn-soft p-2 text-xs text-warn-strong">
      <p className="font-bold">包装して売る食品は、栄養成分表示が原則として必要です。次のどれかに当てはまるときだけ省略できます。</p>
      <ul className="list-disc space-y-0.5 pl-4">
        <li>小規模事業者：消費税の免税事業者（課税売上高1,000万円以下）、または常時使う従業員が20人以下（商業・サービス業は5人以下）</li>
        <li>包装の表示できる面がおおむね30cm²以下</li>
        <li>コーヒー豆・茶葉・スパイスなど、栄養の量がごくわずかなもの</li>
        <li>お店の中で作って、その場で売るもの（そもそも食品表示の対象外）</li>
      </ul>
      <p>省略するとき、ラベルに「省略しています」などの注意書きは要りません。ただし、小さなお店が作った品でも、大きなお店が売る場合は表示が必要です。</p>
    </div>
  );
}
