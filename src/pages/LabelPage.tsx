// 食品表示ラベル：材料の重い順・添加物は「／」のあと・アレルゲンの一括表示を自動で作り、ラベル用紙の大きさで印刷する。
// 最終的な表示の責任はお店にあるので、自動で作った文は必ず直せるようにし、確かめてほしい点を並べて出す
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { labelMissing, LABEL_PAPERS, paperOf, type LabelInfo } from "@shared/label";
import type { Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useRecipe } from "../hooks/useRecipe";
import { useCol } from "../hooks/useData";
import { call } from "../lib/store";
import { buildRecipeLabel, labelData, labelInfoFor, textOutdated } from "../lib/labelBuild";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { LabelSheet, PaperPicker, PrintGrid, sheetSlots, usePrintAdjust, usePrinting } from "../components/label/LabelSheet";
import { PrintHelp } from "../components/label/PrintHelp";
import { LabelExport } from "../components/label/LabelExport";
import { FitNotice } from "../components/label/FitNotice";
import { useConfirm } from "../components/common/ConfirmDialog";
import { fitLabel } from "../lib/labelImage";
import { AdditiveBox } from "../components/label/AdditiveBox";
import { numText } from "../lib/num";
import { nutritionLabelText, recipeNutrition } from "@shared/nutrition";
import { useNutritionOf } from "../hooks/useRecipeNutrition";

const PAPER_KEY = "cookon-labelPaper";
export const readPaper = () => { try { return localStorage.getItem(PAPER_KEY); } catch { return null; } };
export const keepPaper = (id: string) => { try { localStorage.setItem(PAPER_KEY, id); } catch { /* 覚えられなくても印刷はできる */ } };
export const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function LabelPage() {
  const { id } = useParams();
  const { orgId, org, canEdit } = useOrgCtx();
  const { recipe, loading } = useRecipe(orgId, id);
  const ings = useIngredients(orgId);
  // お店で作った材料（タルト生地など）の中身を開くのに、ほかのレシピも読む
  const all = useCol<Recipe>(`organizations/${orgId}/recipes`);
  const recipeById = useMemo(() => new Map(all.list.map((r) => [r.id, r as Recipe])), [all.list]);
  const [paperId, setPaperId] = useState(() => readPaper() ?? LABEL_PAPERS[0].id);
  const [made, setMade] = useState(today);
  const [copies, setCopies] = useState(1);
  const [start, setStart] = useState(1);
  const [info, setInfo] = useState<LabelInfo | null>(null);
  const [msg, setMsg] = useState("");
  const { printing, test, print, printTest } = usePrinting();
  const [adjust, setAdjust] = usePrintAdjust();
  const confirm = useConfirm();
  const paper = paperOf(paperId);

  useEffect(() => {
    if (!recipe || info) return;
    setInfo(labelInfoFor(recipe, org.settings));
  }, [recipe, info, org.settings]);

  const built = useMemo(() => (recipe ? buildRecipeLabel(recipe, ings.byId, recipeById, org.settings) : null), [recipe, ings.byId, recipeById, org.settings]);

  const { nutOf } = useNutritionOf(useMemo(() => [recipe], [recipe]), ings.byId);
  const nut = useMemo(() => (recipe ? recipeNutrition(recipe.items, ings.byId, nutOf, recipe.yield) : null), [recipe, ings.byId, nutOf]);

  if (loading || !info || !built) return <p className="p-10 text-center text-muted">{loading ? "読み込み中…" : "レシピが見つかりません。"}</p>;
  const set = (p: Partial<LabelInfo>) => setInfo((cur) => (cur ? { ...cur, ...p } : cur));
  const missing = labelMissing(info);
  const blocked = missing.length > 0 || built.unconfirmed.length > 0 || built.unlinked.length > 0;
  const nutText = nut ? nutritionLabelText(nut) : null;
  const data = labelData(info, { ...built, nutritionText: nutText }, made);
  const outdated = textOutdated(info, built.ingredientsText);
  const fit = fitLabel(data, paper.w, paper.h);
  const pick = (v: string) => { setPaperId(v); keepPaper(v); };
  async function printNow() {
    if (!fit.fits && !(await confirm({ title: "ラベルに入りきりません", body: `下が約${Math.ceil(fit.needH - paper.h)}mm切れて印刷されます。大きい用紙にするか、文を短くするのがおすすめです。`, ok: "切れたまま印刷", cancel: "やめる" }))) return;
    print();
  }

  async function remember() {
    setMsg("");
    try {
      await call("saveRecipe", { orgId, recipeId: recipe!.id, recipe: { ...recipe, labelInfo: info }, note: "ラベルの内容を更新" });
      setMsg("レシピに覚えました。次からこの内容で始まります。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const inputSm = "rounded-lg border border-line-strong bg-paper px-2 py-1.5 text-sm";
  const input = `w-full ${inputSm}`;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="no-print flex items-center gap-2">
        <Link to={`/recipes/${recipe!.id}`} className="-ml-2 rounded-lg p-1.5 text-muted" aria-label="戻る"><Icon name="back" /></Link>
        <h1 className="flex-1 font-serif text-2xl">ラベル：{recipe!.name}</h1>
      </div>

      <div className="no-print space-y-4">
        <div className="flex justify-center rounded-2xl bg-sand p-4"><LabelSheet d={data} w={paper.w} h={paper.h} /></div>
        <FitNotice d={data} w={paper.w} h={paper.h} fit={fit} onPaper={pick} />
        {built.unconfirmed.length > 0 && (
          <div className="space-y-1 rounded-xl bg-ng/10 p-3 text-sm text-ng">
            <p className="font-bold">アレルゲンをまだ確かめていない材料があります。確かめるまで印刷できません。</p>
            <p>{built.unconfirmed.join("、")}</p>
            {canEdit && <Link to="/tidy#allergen" className="underline">データの整理で、アレルゲンをまとめて確かめる</Link>}
          </div>
        )}
        {missing.length > 0 && (
          <p className="rounded-xl bg-ng/10 p-3 text-sm text-ng">ラベルに必要な項目が空です：{missing.join("・")}。下の欄か、<Link to="/settings#store" className="underline">設定の「お店・ラベル」</Link>で入れてください。</p>
        )}
        {(built.unlinked.length > 0 || built.unknownWeight.length > 0) && (
          <ul className="space-y-1 rounded-xl bg-warn-soft p-3 text-sm text-warn-strong">
            {built.unlinked.length > 0 && <li>材料の一覧と結びついていないもの（アレルゲンが分からないので印刷できません。レシピの編集で材料を選んでください）：{built.unlinked.join("、")}</li>}
            {built.unknownWeight.length > 0 && <li>重さが分からず、並びが正しくないかもしれないもの：{built.unknownWeight.join("、")}</li>}
          </ul>
        )}
        <AdditiveBox orgId={orgId} hints={built.additives} canEdit={canEdit} />
        <section className={`${ui.card} space-y-2`}>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className={ui.label}>名称</span><input className={input} value={info.productName} onChange={(e) => set({ productName: e.target.value })} /></label>
            <label className="space-y-1"><span className={ui.label}>製造日</span><input type="date" className={input} value={made} onChange={(e) => setMade(e.target.value)} /></label>
            <label className="space-y-1"><span className={ui.label}>期限の種類</span>
              <select className={input} value={info.expiryKind} onChange={(e) => set({ expiryKind: e.target.value as LabelInfo["expiryKind"] })}><option>賞味期限</option><option>消費期限</option></select></label>
            <label className="space-y-1"><span className={ui.label}>製造日から何日</span><input className={input} inputMode="numeric" value={info.expiryDays} onChange={(e) => set({ expiryDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clay" checked={!!info.dateOutside} onChange={(e) => set({ dateOutside: e.target.checked })} />
            <span>日付は枠の外に書く（枠の中は「枠外下部に記載」）</span>
          </label>
          {info.dateOutside && (
            <label className="ml-6 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clay" checked={info.datePrint !== false} onChange={(e) => set({ datePrint: e.target.checked })} />
              <span>枠の外の日付も印刷する<span className="block text-xs text-muted">外すと、日付スタンプや手書き用に空けておきます。</span></span>
            </label>
          )}
          <label className="block space-y-1"><span className={ui.label}>原材料名（自動で作った文。直せます）</span>
            <textarea className={`${input} h-24`} value={data.ingredientsText} onChange={(e) => set({ ingredientsText: e.target.value, ingredientsBase: built.ingredientsText })} />
            {outdated && <span className="block text-xs text-warn-strong">手で直したあとにレシピの材料が変わりました。「自動の文に戻す」で作り直してから、もう一度直してください。</span>}
            {info.ingredientsText && <button className="text-xs text-muted underline" onClick={() => set({ ingredientsText: undefined, ingredientsBase: undefined })}>自動の文に戻す</button>}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className={ui.label}>内容量</span>
              <input className={input} value={info.content ?? ""} placeholder={built.contentText} onChange={(e) => set({ content: e.target.value || undefined })} /></label>
            <label className="space-y-1"><span className={ui.label}>保存方法</span><input className={input} value={info.storage} onChange={(e) => set({ storage: e.target.value })} /></label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-clay" disabled={!nutText} checked={!!info.nutrition && !!nutText} onChange={(e) => set({ nutrition: e.target.checked })} />
            <span>栄養成分表示（熱量・たんぱく質・脂質・炭水化物・食塩相当量）を入れる
              <span className="block text-xs text-muted">
                {nutText ? "材料の成分表から計算した推定値です。" : "成分の分からない材料があるので、まだ入れられません（少ない値を刷らないため）。"}
                {!info.nutrition && <span className="block">省略できるのは小規模事業者などの場合だけです（<Link to="/settings#store" className="underline">設定の「お店」</Link>に条件があります）。</span>}
              </span>
            </span>
          </label>
          {info.nutrition && nut && nut.missing.length > 0 && (
            <div className="ml-6 space-y-1 rounded-lg bg-warn-soft p-2 text-xs text-warn-strong">
              <p>成分か重さが分からない材料があり、栄養成分表示はラベルに入っていません。材料を押すと、100gあたりの成分を入れられます（袋の裏の表示を写す）。</p>
              <p className="flex flex-wrap gap-x-2 gap-y-1">
                {nut.missingIngs.map((m) => canEdit
                  ? <Link key={m.id} to={`/ingredients?open=${m.id}&from=/recipes/${recipe!.id}/label`} className="underline">{m.name}</Link>
                  : <span key={m.id}>{m.name}</span>)}
                {nut.missing.filter((n) => !nut.missingIngs.some((m) => m.name === n)).map((n) => <span key={n}>{n}（材料に未登録）</span>)}
              </p>
              {canEdit && <p><Link to="/tidy#link" className="underline">データの整理で、成分表（共有の材料）にまとめて結ぶ</Link></p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className={ui.label}>製造者の名前</span><input className={input} value={info.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} /></label>
            <label className="space-y-1"><span className={ui.label}>製造者の住所（必須）</span><input className={input} value={info.manufacturerAddress ?? ""} placeholder="都道府県から" onChange={(e) => set({ manufacturerAddress: e.target.value })} /></label>
          </div>
          {canEdit && <button className="text-sm text-clay-strong underline" onClick={remember}>このラベルの内容をレシピに覚える（まとめて印刷でも使います）</button>}
          {msg && <p className="text-sm text-ink-soft">{msg}</p>}
        </section>
        <section className={`${ui.card} space-y-2`}>
          <label className="block space-y-1"><span className={ui.label}>ラベル用紙</span>
            <PaperPicker paperId={paper.id} papers={LABEL_PAPERS} onChange={pick} /></label>
          {paper.sheet?.cut && <p className="text-xs text-muted">86.4×42.3mm の1面に2個分を並べます。貼る前に、はさみで1面を縦に半分に切ってください。</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">枚数<input className={`${inputSm} w-20`} inputMode="numeric" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(numText(e.target.value)) || 1)))} /></label>
            {paper.sheet && (
              <label className="flex items-center gap-2">何面目から
                <select className={`${inputSm} w-20`} value={start} onChange={(e) => setStart(Number(e.target.value))}>
                  {Array.from({ length: sheetSlots(paper) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
            )}
          </div>
          {paper.sheet && start > 1 && <p className="text-xs text-muted">使いかけのシートの {start} 面目から刷ります（左上から右へ数えます）。</p>}
          <button disabled={blocked} className={`w-full ${ui.primary} flex items-center justify-center gap-2`} onClick={printNow}><Icon name="printer" />{blocked ? "上の赤い項目を済ませると印刷できます" : "印刷する"}</button>
          <PrintHelp paper={paper} adjust={adjust} onAdjust={setAdjust} onTest={printTest} />
          <LabelExport d={data} w={paper.w} h={paper.h} name={recipe!.name} disabled={blocked} />
          <Link to={`/labels?add=${recipe!.id}`} className="block text-sm text-clay-strong underline">ほかの商品とまとめて印刷する・詰め合わせのラベルを作る</Link>
        </section>
        <p className="text-xs leading-relaxed text-muted">
          表示は食品表示基準にそって自動で作っています（原材料は重い順、添加物は「／」のあと、アレルゲンは最後にまとめて、お店で作った材料は「（ ）」の中に中身）。
          複合原材料の省略のしかたなどは対象外です。栄養成分表示は成分表から計算した推定値で、焼いて減る水分などは見ていません。販売の前に、お店の責任で必ず内容を確かめてください。
        </p>
      </div>

      {printing && <PrintGrid labels={Array.from({ length: copies }, () => data)} paper={paper} start={start} adjust={adjust} test={test} />}
    </div>
  );
}
