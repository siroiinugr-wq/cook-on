// 食品表示ラベル：材料の重い順・アレルゲンの一括表示を自動で作り、ラベル用紙の大きさで印刷する。
// 最終的な表示の責任はお店にあるので、自動で作った文は必ず直せるようにし、確かめてほしい点を並べて出す
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { calcCost } from "@shared/cost";
import { buildLabel, expiryDate, LABEL_PAPERS, type LabelInfo, type LabelLine } from "@shared/label";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useRecipe } from "../hooks/useRecipe";
import { call } from "../lib/store";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { LabelSheet, printCss, type LabelData } from "../components/label/LabelSheet";

const PAPER_KEY = "cookon-labelPaper";
const readPaper = () => { try { return localStorage.getItem(PAPER_KEY); } catch { return null; } };
const keepPaper = (id: string) => { try { localStorage.setItem(PAPER_KEY, id); } catch { /* 覚えられなくても印刷はできる */ } };
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function LabelPage() {
  const { id } = useParams();
  const { orgId, org, canEdit } = useOrgCtx();
  const { recipe, loading } = useRecipe(orgId, id);
  const ings = useIngredients(orgId);
  const [paperId, setPaperId] = useState(() => readPaper() ?? LABEL_PAPERS[0].id);
  const [made, setMade] = useState(today);
  const [copies, setCopies] = useState(1);
  const [info, setInfo] = useState<LabelInfo | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const paper = LABEL_PAPERS.find((p) => p.id === paperId) ?? LABEL_PAPERS[0];

  useEffect(() => {
    if (!recipe || info) return;
    setInfo({
      productName: recipe.category || "菓子", storage: "直射日光・高温多湿を避けて保存してください", expiryDays: 7, expiryKind: "賞味期限",
      manufacturer: org.settings.manufacturer, ...recipe.labelInfo,
    });
  }, [recipe, info, org.settings.manufacturer]);

  const built = useMemo(() => {
    if (!recipe) return null;
    const grams = calcCost(recipe.items, ings.byId).lines.map((l) => l.grams);
    const unlinked: string[] = [];
    const lines: LabelLine[] = recipe.items.map((it, i) => {
      const ing = it.ingredientId ? ings.byId.get(it.ingredientId) : undefined;
      if (!ing) unlinked.push(it.name);
      return { name: ing?.labelName || ing?.name || it.name, grams: grams[i], allergens: ing?.allergens ?? [], isAdditive: ing?.isAdditive };
    });
    return { ...buildLabel(lines, { pieces: recipe.yield.pieces, gramsPerPiece: recipe.yield.gramsPerPiece, includeRecommended: org.settings.includeRecommendedAllergens }), unlinked };
  }, [recipe, ings.byId, org.settings.includeRecommendedAllergens]);

  if (loading || !info || !built) return <p className="p-10 text-center text-muted">{loading ? "読み込み中…" : "レシピが見つかりません。"}</p>;
  const set = (p: Partial<LabelInfo>) => setInfo({ ...info, ...p });
  const data: LabelData = { ...info, ingredientsText: text ?? built.ingredientsText, contentText: built.contentText, expiry: expiryDate(new Date(`${made}T00:00:00+09:00`), info.expiryDays) };

  async function remember() {
    setMsg("");
    try {
      await call("saveRecipe", { orgId, recipeId: recipe!.id, recipe: { ...recipe, labelInfo: info }, note: "ラベルの内容を更新" });
      setMsg("レシピに覚えました。次からこの内容で始まります。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const input = "w-full rounded-lg border border-line-strong bg-paper px-2 py-1.5 text-sm";
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <style>{`@media print { ${printCss(paper)} }`}</style>
      <div className="no-print flex items-center gap-2">
        <Link to={`/recipes/${recipe!.id}`} className="-ml-2 rounded-lg p-1.5 text-muted" aria-label="戻る"><Icon name="back" /></Link>
        <h1 className="flex-1 font-serif text-2xl">ラベル：{recipe!.name}</h1>
      </div>

      <div className="no-print space-y-4">
        <div className="flex justify-center rounded-2xl bg-sand p-4"><LabelSheet d={data} w={paper.w} h={paper.h} /></div>
        {(built.unlinked.length > 0 || built.unknownWeight.length > 0) && (
          <ul className="space-y-1 rounded-xl bg-warn-soft p-3 text-sm text-warn-strong">
            {built.unlinked.length > 0 && <li>材料の一覧と結びついていないもの（アレルゲンが分かりません）：{built.unlinked.join("、")}</li>}
            {built.unknownWeight.length > 0 && <li>重さが分からず、並びが正しくないかもしれないもの：{built.unknownWeight.join("、")}</li>}
          </ul>
        )}
        <section className={`${ui.card} space-y-2`}>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className={ui.label}>名称</span><input className={input} value={info.productName} onChange={(e) => set({ productName: e.target.value })} /></label>
            <label className="space-y-1"><span className={ui.label}>製造日</span><input type="date" className={input} value={made} onChange={(e) => setMade(e.target.value)} /></label>
            <label className="space-y-1"><span className={ui.label}>期限の種類</span>
              <select className={input} value={info.expiryKind} onChange={(e) => set({ expiryKind: e.target.value as LabelInfo["expiryKind"] })}><option>賞味期限</option><option>消費期限</option></select></label>
            <label className="space-y-1"><span className={ui.label}>製造日から何日</span><input className={input} inputMode="numeric" value={info.expiryDays} onChange={(e) => set({ expiryDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
          </div>
          <label className="block space-y-1"><span className={ui.label}>原材料名（自動で作った文。直せます）</span>
            <textarea className={`${input} h-24`} value={data.ingredientsText} onChange={(e) => setText(e.target.value)} />
            {text !== null && <button className="text-xs text-muted underline" onClick={() => setText(null)}>自動の文に戻す</button>}
          </label>
          <label className="block space-y-1"><span className={ui.label}>保存方法</span><input className={input} value={info.storage} onChange={(e) => set({ storage: e.target.value })} /></label>
          <label className="block space-y-1"><span className={ui.label}>製造者</span><input className={input} value={info.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} /></label>
          {canEdit && <button className="text-sm text-clay-strong underline" onClick={remember}>名称・期限・保存方法をこのレシピに覚える</button>}
          {msg && <p className="text-sm text-ink-soft">{msg}</p>}
        </section>
        <section className={`${ui.card} space-y-2`}>
          <label className="block space-y-1"><span className={ui.label}>ラベル用紙</span>
            <select className={input} value={paperId} onChange={(e) => { setPaperId(e.target.value); keepPaper(e.target.value); }}>
              {LABEL_PAPERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="flex items-center gap-2 text-sm">枚数<input className={`${input} w-20`} type="number" min={1} max={200} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
          <button className={`w-full ${ui.primary} flex items-center justify-center gap-2`} onClick={() => window.print()}><Icon name="printer" />印刷する</button>
          <p className="text-xs text-muted">印刷の画面で「余白なし」「倍率100%」を選んでください。PDFに保存もできます。</p>
        </section>
        <p className="text-xs leading-relaxed text-muted">
          表示は食品表示基準にそって自動で作っていますが、複合原材料の書き方・添加物の用途名・栄養成分表示などは対象外です。
          販売の前に、お店の責任で必ず内容を確かめてください。
        </p>
      </div>

      <div className="print-only"><div className="label-grid">{Array.from({ length: copies }, (_, i) => <div key={i}><LabelSheet d={data} w={paper.w} h={paper.h} /></div>)}</div></div>
    </div>
  );
}
