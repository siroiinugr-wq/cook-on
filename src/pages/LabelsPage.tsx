// ラベルをまとめて印刷：いくつもの商品を1回で刷る（クッキー10枚・スコーン6枚…）。
// 詰め合わせ（ギフト・コーヒー豆のセット）は1枚のラベルに品目ごとの原材料を【名前】で並べる（食品表示基準の詰め合わせの書き方）。
// それぞれの商品の名称・期限・内容量などは、1枚ずつのラベル画面で「レシピに覚える」を押した内容を使う
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { assortContent, assortText, labelMissing, LABEL_PAPERS, paperOf, type LabelInfo } from "@shared/label";
import type { Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useCol } from "../hooks/useData";
import { buildRecipeLabel, labelData, labelInfoFor, type BuiltLabel, type LabelData } from "../lib/labelBuild";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { LabelSheet, PaperPicker, PrintGrid, printCss, sheetSlots } from "../components/label/LabelSheet";
import { keepPaper, readPaper, today } from "./LabelPage";

interface Row { recipeId: string; count: number }
const inputSm = "rounded-lg border border-line-strong bg-paper px-2 py-1.5 text-sm";
const input = `w-full ${inputSm}`;

export function LabelsPage() {
  const { orgId, org } = useOrgCtx();
  const [params] = useSearchParams();
  const ings = useIngredients(orgId);
  const all = useCol<Recipe>(`organizations/${orgId}/recipes`);
  const recipes = useMemo(() => all.list.filter((r) => !(r as { archived?: boolean }).archived).map((r) => r as Recipe).sort((a, b) => a.name.localeCompare(b.name, "ja")), [all.list]);
  const recipeById = useMemo(() => new Map(all.list.map((r) => [r.id, r as Recipe])), [all.list]);
  const [mode, setMode] = useState<"each" | "assort">("each");
  const [rows, setRows] = useState<Row[]>(() => (params.get("add") ? [{ recipeId: params.get("add")!, count: 1 }] : []));
  const [made, setMade] = useState(today);
  const [paperId, setPaperId] = useState(() => readPaper() ?? LABEL_PAPERS[0].id);
  const [start, setStart] = useState(1);
  const [copies, setCopies] = useState(1);
  const [assort, setAssort] = useState<LabelInfo | null>(null);
  const paper = paperOf(paperId);

  const items = useMemo(() => rows.flatMap((row) => {
    const r = recipeById.get(row.recipeId);
    if (!r) return [];
    const built = buildRecipeLabel(r, ings.byId, recipeById, org.settings);
    const info = labelInfoFor(r, org.settings);
    return [{ row, recipe: r, built, info, problems: problemsOf(info, built) }];
  }), [rows, recipeById, ings.byId, org.settings]);

  // 詰め合わせの初めの値：期限は一番短い商品に合わせ、どれかが消費期限なら消費期限
  useEffect(() => {
    if (mode !== "assort" || assort || !items.length) return;
    const first = items[0].info;
    setAssort({
      ...first,
      productName: "焼菓子詰合せ",
      expiryDays: Math.min(...items.map((i) => i.info.expiryDays || 7)),
      expiryKind: items.some((i) => i.info.expiryKind === "消費期限") ? "消費期限" : first.expiryKind,
      storage: org.settings.labelStorage || first.storage,
      content: undefined, ingredientsText: undefined, ingredientsBase: undefined,
    });
  }, [mode, assort, items, org.settings.labelStorage]);

  const unused = recipes.filter((r) => !rows.some((x) => x.recipeId === r.id));
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));

  let labels: LabelData[] = [];
  let blocked = items.length === 0;
  let preview: LabelData | null = null;
  if (mode === "each") {
    for (const it of items) {
      const d = labelData(it.info, it.built, made);
      preview ??= d;
      if (it.problems.length) blocked = true;
      labels.push(...Array.from({ length: it.row.count }, () => d));
    }
  } else if (assort) {
    const text = assortText(items.map((i) => ({ name: i.recipe.name, text: i.info.ingredientsText || i.built.ingredientsText })));
    const content = assortContent(items.map((i) => ({ name: i.recipe.name, count: i.row.count })));
    const d = labelData({ ...assort, content: assort.content || content }, { ingredientsText: text, contentText: content }, made);
    preview = d;
    if (items.some((i) => i.problems.length) || labelMissing(assort).length) blocked = true;
    labels = Array.from({ length: copies }, () => d);
  }
  const setA = (p: Partial<LabelInfo>) => assort && setAssort({ ...assort, ...p });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <style>{`@media print { ${printCss(paper)} }`}</style>
      <div className="no-print space-y-4">
        <PageHead title="ラベルをまとめて印刷" back={params.get("add") ? `/recipes/${params.get("add")}/label` : "/"} />
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-sand p-1 text-sm">
          {([["each", "商品ごとに何枚か"], ["assort", "詰め合わせ（ギフト・セット）"]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-3 py-2 ${mode === k ? "bg-paper font-bold shadow-sm" : "text-muted"}`}>{t}</button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {mode === "each"
            ? "いくつもの商品のラベルを1回で刷ります。名称・期限・内容量などは、それぞれのラベル画面で「レシピに覚える」を押した内容を使います（コーヒー豆の「200g」などもそこで）。"
            : "1枚のラベルに、品目ごとの原材料を【商品名】で並べます（詰め合わせの書き方）。期限は一番短い商品に合わせています。"}
        </p>

        <section className={`${ui.card} space-y-2`}>
          {items.map((it, i) => (
            <div key={it.row.recipeId} className="space-y-1 border-b border-line pb-2 last:border-0">
              <div className="flex items-center gap-2">
                <Link to={`/recipes/${it.recipe.id}/label`} className="flex-1 truncate font-medium underline decoration-line-strong">{it.recipe.name}</Link>
                <input className={`${inputSm} w-16 text-right`} inputMode="numeric" value={it.row.count} onChange={(e) => setRow(i, { count: Math.max(0, Math.min(200, Number(e.target.value.replace(/\D/g, "")) || 0)) })} />
                <span className="text-sm text-muted">{mode === "each" ? "枚" : "個"}</span>
                <button className="rounded-lg p-1 text-muted" aria-label="外す" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="close" className="h-4 w-4" /></button>
              </div>
              {it.problems.length > 0 && <p className="text-xs text-ng">印刷できません：{it.problems.join("・")}（名前を押してラベル画面で直す）</p>}
            </div>
          ))}
          <select className={input} value="" onChange={(e) => e.target.value && setRows([...rows, { recipeId: e.target.value, count: mode === "each" ? 1 : 1 }])}>
            <option value="">＋ 商品（レシピ）を足す</option>
            {unused.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </section>

        {mode === "assort" && assort && (
          <section className={`${ui.card} space-y-2`}>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className={ui.label}>名称</span><input className={input} value={assort.productName} onChange={(e) => setA({ productName: e.target.value })} /></label>
              <label className="space-y-1"><span className={ui.label}>内容量</span><input className={input} value={assort.content ?? ""} placeholder={preview?.contentText} onChange={(e) => setA({ content: e.target.value || undefined })} /></label>
              <label className="space-y-1"><span className={ui.label}>期限の種類</span>
                <select className={input} value={assort.expiryKind} onChange={(e) => setA({ expiryKind: e.target.value as LabelInfo["expiryKind"] })}><option>賞味期限</option><option>消費期限</option></select></label>
              <label className="space-y-1"><span className={ui.label}>製造日から何日</span><input className={input} inputMode="numeric" value={assort.expiryDays} onChange={(e) => setA({ expiryDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            </div>
            <label className="block space-y-1"><span className={ui.label}>保存方法</span><input className={input} value={assort.storage} onChange={(e) => setA({ storage: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-clay" checked={!!assort.dateOutside} onChange={(e) => setA({ dateOutside: e.target.checked })} />日付は枠の外に書く</label>
            <label className="flex items-center gap-2 text-sm">枚数<input className={`${inputSm} w-20`} inputMode="numeric" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value.replace(/\D/g, "")) || 1)))} /></label>
          </section>
        )}

        <section className={`${ui.card} space-y-2`}>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className={ui.label}>製造日</span><input type="date" className={input} value={made} onChange={(e) => setMade(e.target.value)} /></label>
            {paper.sheet && (
              <label className="space-y-1"><span className={ui.label}>何面目から</span>
                <select className={input} value={start} onChange={(e) => setStart(Number(e.target.value))}>
                  {Array.from({ length: sheetSlots(paper) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select></label>
            )}
          </div>
          <label className="block space-y-1"><span className={ui.label}>ラベル用紙</span>
            <PaperPicker paperId={paper.id} papers={LABEL_PAPERS} onChange={(v) => { setPaperId(v); keepPaper(v); }} /></label>
          {mode === "assort" && paper.w * paper.h < 3500 && <p className="text-xs text-warn-strong">詰め合わせは原材料が長くなります。62×100mm や自由な大きさなど、大きめの用紙がおすすめです。</p>}
          {preview && <div className="flex justify-center overflow-x-auto rounded-2xl bg-sand p-4"><LabelSheet d={preview} w={paper.w} h={paper.h} /></div>}
          <button disabled={blocked} className={`w-full ${ui.primary} flex items-center justify-center gap-2`} onClick={() => window.print()}>
            <Icon name="printer" />{blocked ? (items.length ? "赤い項目を済ませると印刷できます" : "商品を足してください") : `${labels.length}枚を印刷する`}
          </button>
          <p className="text-xs text-muted">印刷の画面で「余白なし」「倍率100%」を選んでください。</p>
        </section>
      </div>
      <PrintGrid labels={labels} paper={paper} start={start} />
    </div>
  );
}

function problemsOf(info: LabelInfo, b: BuiltLabel): string[] {
  const out = labelMissing(info).map((m) => `${m}が空`);
  if (b.unconfirmed.length) out.push(`アレルゲン未確認（${b.unconfirmed.join("、")}）`);
  if (b.unlinked.length) out.push(`材料が結びついていない（${b.unlinked.join("、")}）`);
  return out;
}
