// ラベルをまとめて印刷：いくつもの商品を1回で刷る（クッキー10枚・スコーン6枚…）。
// 詰め合わせ（ギフト箱の外に貼るラベル）は1枚のラベルに品目ごとの原材料を【名前】で並べる（食品表示基準の詰め合わせの書き方）。
// レシピの無い品目（コーヒー豆など）は名前・原材料・内容量を手で入れる。よく使う詰め合わせは labelSets に保存して呼び出す。
// レシピは打って探して足す（LabelItemPicker）。レシピの無い品目は labelItems に保存して次から探せる。よく使う詰め合わせは一覧で探す（2026-11-05）。
// それぞれの商品の名称・期限・内容量などは、1枚ずつのラベル画面で「レシピに覚える」を押した内容を使う
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { assortContent, assortName, assortText, labelMissing, LABEL_PAPERS, paperOf, type LabelInfo } from "@shared/label";
import type { Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useCol } from "../hooks/useData";
import { toMatchKey } from "@shared/matchKey";
import { newId, removeDoc, saveDoc } from "../lib/store";
import { buildRecipeLabel, labelData, labelInfoFor, type BuiltLabel, type LabelData } from "../lib/labelBuild";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { useConfirm } from "../components/common/ConfirmDialog";
import { LabelSheet, PaperPicker, PrintGrid, printCss, sheetSlots, usePrinting } from "../components/label/LabelSheet";
import { LabelExport } from "../components/label/LabelExport";
import { LabelItemPicker, type LabelItem } from "../components/label/LabelItemPicker";
import { keepPaper, readPaper, today } from "./LabelPage";

/** 品目1行：お店のレシピか、レシピの無い品目（コーヒー豆など）。content は詰め合わせでの1つの内容量（100g など） */
interface Row { recipeId?: string; free?: { name: string; text: string }; count: number; content?: string; /** 保存した品目から足したとき（上書き保存の先） */ itemId?: string }
/** よく使う詰め合わせ organizations/{orgId}/labelSets/{id} */
interface LabelSet { id: string; name: string; rows: Row[]; info: Partial<LabelInfo> }

const inputSm = "rounded-lg border border-line-strong bg-paper px-2 py-1.5 text-sm";
const input = `w-full ${inputSm}`;
const num = (v: string, max = 200) => Math.max(0, Math.min(max, Number(v.replace(/\D/g, "")) || 0));
/** Firestore は undefined を保存できないので落とす */
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export function LabelsPage() {
  const { orgId, org, canEdit } = useOrgCtx();
  const confirm = useConfirm();
  const [params] = useSearchParams();
  const ings = useIngredients(orgId);
  const all = useCol<Recipe>(`organizations/${orgId}/recipes`);
  const sets = useCol<Omit<LabelSet, "id">>(`organizations/${orgId}/labelSets`);
  const savedItems = useCol<Omit<LabelItem, "id">>(`organizations/${orgId}/labelItems`);
  const itemList = useMemo(() => (savedItems.list as LabelItem[]).slice().sort((a, b) => a.name.localeCompare(b.name, "ja")), [savedItems.list]);
  const recipes = useMemo(() => all.list.filter((r) => !(r as { archived?: boolean }).archived).map((r) => r as Recipe).sort((a, b) => a.name.localeCompare(b.name, "ja")), [all.list]);
  const recipeById = useMemo(() => new Map(all.list.map((r) => [r.id, r as Recipe])), [all.list]);
  const [mode, setMode] = useState<"each" | "assort">(params.get("mode") === "assort" ? "assort" : "each");
  const [rows, setRows] = useState<Row[]>(() => (params.get("add") ? [{ recipeId: params.get("add")!, count: 1 }] : []));
  const [made, setMade] = useState(today);
  const [paperId, setPaperId] = useState(() => readPaper() ?? LABEL_PAPERS[0].id);
  const [start, setStart] = useState(1);
  const [copies, setCopies] = useState(1);
  const [assort, setAssort] = useState<LabelInfo | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [setName, setSetName] = useState("");
  const [msg, setMsg] = useState("");
  const [rowMsg, setRowMsg] = useState<{ at: number; text: string } | null>(null);
  const [printing, print] = usePrinting();
  const paper = paperOf(paperId);

  const items = useMemo(() => rows.flatMap((row, at) => {
    if (row.free) {
      const problems = row.free.name.trim() && row.free.text.trim() ? [] : ["品目の名前と原材料を入れてください"];
      return [{ at, row, name: row.free.name.trim(), text: row.free.text.trim(), content: row.content, info: null as LabelInfo | null, recipe: null as Recipe | null, built: null as BuiltLabel | null, problems }];
    }
    const r = row.recipeId ? recipeById.get(row.recipeId) : undefined;
    if (!r) return [];
    const built = buildRecipeLabel(r, ings.byId, recipeById, org.settings);
    const info = labelInfoFor(r, org.settings);
    return [{ at, row, name: r.name, text: info.ingredientsText || built.ingredientsText, content: row.content ?? info.content, info, recipe: r, built, problems: problemsOf(info, built) }];
  }), [rows, recipeById, ings.byId, org.settings]);
  const shown = mode === "each" ? items.filter((i) => i.recipe) : items;

  // 詰め合わせの初めの値：期限は一番短い商品に合わせ、どれかが消費期限なら消費期限
  useEffect(() => {
    if (mode !== "assort" || assort || !items.length) return;
    const withInfo = items.filter((i) => i.info);
    const first = withInfo[0]?.info;
    setAssort({
      productName: assortName(first?.productName, items.filter((i) => i.row.free).map((i) => i.name)),
      expiryDays: withInfo.length ? Math.min(...withInfo.map((i) => i.info!.expiryDays || 7)) : org.settings.labelExpiryDays,
      expiryKind: withInfo.some((i) => i.info!.expiryKind === "消費期限") ? "消費期限" : (first?.expiryKind ?? org.settings.labelExpiryKind),
      storage: org.settings.labelStorage || first?.storage || "直射日光・高温多湿を避けて保存してください",
      dateOutside: org.settings.labelDateOutside, datePrint: org.settings.labelDatePrint,
      manufacturer: org.settings.manufacturer, manufacturerAddress: org.settings.manufacturerAddress,
    });
  }, [mode, assort, items, org.settings]);

  const unused = recipes.filter((r) => !rows.some((x) => x.recipeId === r.id));
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));

  let labels: LabelData[] = [];
  let blocked = shown.length === 0;
  let preview: LabelData | null = null;
  if (mode === "each") {
    for (const it of shown) {
      const d = labelData(it.info!, it.built!, made);
      preview ??= d;
      if (it.problems.length) blocked = true;
      labels.push(...Array.from({ length: it.row.count }, () => d));
    }
  } else if (assort && items.length) {
    const live = items.filter((i) => i.row.count > 0);
    const text = assortText(live.map((i) => ({ name: i.name, text: i.text })));
    const content = assortContent(live.map((i) => ({ name: i.name, count: i.row.count, content: i.content })));
    const d = labelData({ ...assort, content: assort.content || content }, { ingredientsText: text, contentText: content }, made);
    preview = d;
    if (live.some((i) => i.problems.length) || labelMissing(assort).length || !live.length) blocked = true;
    labels = Array.from({ length: copies }, () => d);
  }
  const setA = (p: Partial<LabelInfo>) => assort && setAssort({ ...assort, ...p });

  function load(s: LabelSet) {
    setRows(s.rows);
    setAssort({ ...(assort ?? labelInfoForOrg(org.settings)), ...s.info, manufacturer: org.settings.manufacturer, manufacturerAddress: org.settings.manufacturerAddress });
    setSetId(s.id);
    setSetName(s.name);
    setMsg("");
  }
  /** レシピの無い品目を保存する（次から「品目を足す」で探せる）。同じ名前があれば上書き */
  async function keepItem(at: number) {
    const row = rows[at];
    if (!row.free) return;
    const name = row.free.name.trim();
    if (!name || !row.free.text.trim()) { setRowMsg({ at, text: "品目名と原材料を入れてから保存してください。" }); return; }
    const same = itemList.find((i) => i.id === row.itemId) ?? itemList.find((i) => i.name === name);
    const id = same?.id ?? newId(`organizations/${orgId}/labelItems`);
    try {
      await saveDoc(`organizations/${orgId}/labelItems/${id}`, clean({ name: name.slice(0, 60), text: row.free.text.trim().slice(0, 1000), content: row.content?.trim().slice(0, 40) || undefined }), { merge: false });
      setRow(at, { itemId: id });
      setRowMsg({ at, text: same ? `「${name}」を上書きしました。` : `「${name}」を保存しました。次から「品目を足す」で探せます。` });
    } catch {
      setRowMsg({ at, text: "保存できませんでした。" });
    }
  }
  async function dropItem(i: LabelItem) {
    if (!(await confirm({ title: `保存した品目「${i.name}」を消しますか？`, body: "よく使う詰め合わせに入っている分はそのまま残ります。", ok: "消す" }))) return;
    await removeDoc(`organizations/${orgId}/labelItems/${i.id}`);
  }
  async function save(asNew: boolean) {
    if (!assort || !rows.length) return;
    const name = setName.trim() || assort.productName;
    const id = !asNew && setId ? setId : newId(`organizations/${orgId}/labelSets`);
    const { productName, content, expiryKind, expiryDays, storage, dateOutside, datePrint } = assort;
    try {
      await saveDoc(`organizations/${orgId}/labelSets/${id}`, clean({ name: name.slice(0, 40), rows: rows.slice(0, 20), info: { productName, content, expiryKind, expiryDays, storage, dateOutside, datePrint } }), { merge: false });
      setSetId(id);
      setSetName(name);
      setMsg(`「${name}」を保存しました。次から上の一覧で呼び出せます。`);
    } catch {
      setMsg("保存できませんでした。");
    }
  }
  async function drop(s: LabelSet) {
    if (!(await confirm({ title: `「${s.name}」を消しますか？`, body: "レシピや材料は消えません。", ok: "消す" }))) return;
    await removeDoc(`organizations/${orgId}/labelSets/${s.id}`);
    if (setId === s.id) setSetId(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <style>{`@media print { ${printCss(paper)} }`}</style>
      <div className="no-print space-y-4">
        <PageHead title="ラベルをまとめて印刷" back={params.get("add") ? `/recipes/${params.get("add")}/label` : "/"} />
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-sand p-1 text-sm">
          {([["each", "商品ごとに何枚か"], ["assort", "詰め合わせ（箱の外に貼る）"]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setMode(k)} className={`rounded-lg px-3 py-2 ${mode === k ? "bg-paper font-bold shadow-sm" : "text-muted"}`}>{t}</button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {mode === "each"
            ? "いくつもの商品のラベルを1回で刷ります。名称・期限・内容量などは、それぞれのラベル画面で「レシピに覚える」を押した内容を使います。"
            : "ギフト箱などの外に貼る1枚のラベルです。品目ごとの原材料を【品目名】で並べ、内容量も品目ごとに書きます（詰め合わせの書き方）。期限は一番短い品目に合わせています。"}
        </p>

        {mode === "assort" && sets.list.length > 0 && (
          <SetList sets={sets.list as LabelSet[]} current={setId} canEdit={canEdit} onLoad={load} onDrop={drop}
            nameOf={(r) => r.free?.name || (r.recipeId ? recipeById.get(r.recipeId)?.name : undefined) || "（消したレシピ）"} />
        )}

        <section className={`${ui.card} space-y-2`}>
          {shown.map((it) => (
            <div key={it.at} className="space-y-1 border-b border-line pb-2 last:border-0">
              <div className="flex items-center gap-2">
                {it.recipe
                  ? <Link to={`/recipes/${it.recipe.id}/label`} className="min-w-0 flex-1 truncate font-medium underline decoration-line-strong">{it.name}</Link>
                  : <input className={`${inputSm} min-w-0 flex-1`} placeholder="品目名（例：コーヒー豆（エチオピア））" value={it.row.free!.name} onChange={(e) => setRow(it.at, { free: { ...it.row.free!, name: e.target.value } })} />}
                <input className={`${inputSm} w-14 text-right`} inputMode="numeric" value={it.row.count} onChange={(e) => setRow(it.at, { count: num(e.target.value) })} />
                <span className="text-sm text-muted">{mode === "each" ? "枚" : "個"}</span>
                <button className="rounded-lg p-1 text-muted" aria-label="外す" onClick={() => setRows(rows.filter((_, j) => j !== it.at))}><Icon name="close" className="h-4 w-4" /></button>
              </div>
              {mode === "each" && !it.problems.length && <LabelExport compact d={labelData(it.info!, it.built!, made)} w={paper.w} h={paper.h} name={it.name} />}
              {mode === "assort" && (
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  {it.row.free
                    ? <input className={input} placeholder="原材料名（例：コーヒー豆（生豆生産国名 エチオピア））" value={it.row.free.text} onChange={(e) => setRow(it.at, { free: { ...it.row.free!, text: e.target.value } })} />
                    : <span className="truncate self-center text-xs text-muted">{it.text}</span>}
                  <input className={input} placeholder={it.row.free ? "100g" : "1つの内容量"} value={it.row.content ?? ""} onChange={(e) => setRow(it.at, { content: e.target.value || undefined })} />
                </div>
              )}
              {it.row.free && canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <button className="text-xs text-clay-strong underline" onClick={() => keepItem(it.at)}>{it.row.itemId ? "保存した品目を上書き" : "この品目を保存して次も使う"}</button>
                  {rowMsg?.at === it.at && <span className="text-xs text-ink-soft">{rowMsg.text}</span>}
                </div>
              )}
              {it.problems.length > 0 && <p className="text-xs text-ng">印刷できません：{it.problems.join("・")}{it.recipe && "（名前を押してラベル画面で直す）"}</p>}
            </div>
          ))}
          <LabelItemPicker recipes={unused}
            items={mode === "assort" ? itemList.filter((i) => !rows.some((r) => r.itemId === i.id)) : undefined}
            onRecipe={(r) => setRows((cur) => [...cur, { recipeId: r.id, count: 1 }])}
            onItem={(i) => setRows((cur) => [...cur, { free: { name: i.name, text: i.text }, content: i.content, count: 1, itemId: i.id }])}
            onDropItem={canEdit ? dropItem : undefined}
            onFree={mode === "assort" ? (name) => setRows((cur) => [...cur, { free: { name, text: "" }, count: 1 }]) : undefined} />
        </section>

        {mode === "assort" && assort && (
          <section className={`${ui.card} space-y-2`}>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className={ui.label}>名称</span><input className={input} value={assort.productName} onChange={(e) => setA({ productName: e.target.value })} /></label>
              <label className="space-y-1"><span className={ui.label}>内容量（空なら品目ごと）</span><input className={input} value={assort.content ?? ""} placeholder="自動" onChange={(e) => setA({ content: e.target.value || undefined })} /></label>
              <label className="space-y-1"><span className={ui.label}>期限の種類</span>
                <select className={input} value={assort.expiryKind} onChange={(e) => setA({ expiryKind: e.target.value as LabelInfo["expiryKind"] })}><option>賞味期限</option><option>消費期限</option></select></label>
              <label className="space-y-1"><span className={ui.label}>製造日から何日</span><input className={input} inputMode="numeric" value={assort.expiryDays} onChange={(e) => setA({ expiryDays: num(e.target.value, 3650) })} /></label>
            </div>
            <label className="block space-y-1"><span className={ui.label}>保存方法</span><input className={input} value={assort.storage} onChange={(e) => setA({ storage: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-clay" checked={!!assort.dateOutside} onChange={(e) => setA({ dateOutside: e.target.checked })} />日付は枠の外に書く</label>
            <label className="flex items-center gap-2 text-sm">枚数<input className={`${inputSm} w-20`} inputMode="numeric" value={copies} onChange={(e) => setCopies(Math.max(1, num(e.target.value)))} /></label>
            {canEdit && (
              <div className="space-y-1 border-t border-line pt-2">
                <span className={ui.label}>よく使う詰め合わせとして保存</span>
                <div className="flex gap-2">
                  <input className={input} maxLength={40} placeholder={assort.productName} value={setName} onChange={(e) => setSetName(e.target.value)} />
                  {setId && <button className={`${ui.secondary} whitespace-nowrap py-1.5 text-sm`} onClick={() => save(false)}>上書き</button>}
                  <button className={`${ui.secondary} whitespace-nowrap py-1.5 text-sm`} onClick={() => save(true)}>{setId ? "別に保存" : "保存"}</button>
                </div>
                {msg && <p className="text-xs text-ink-soft">{msg}</p>}
              </div>
            )}
            <p className="text-xs text-muted">箱の中の品物それぞれに表示があり、箱の外から見えるなら、外のラベルは省けます。見えない箱は、外にこのラベルを貼ってください。</p>
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
          <button disabled={blocked} className={`w-full ${ui.primary} flex items-center justify-center gap-2`} onClick={print}>
            <Icon name="printer" />{blocked ? (shown.length ? "赤い項目を済ませると印刷できます" : "商品を足してください") : `${labels.length}枚を印刷する`}
          </button>
          <p className="text-xs text-muted">印刷の画面で「余白なし」「倍率100%」を選んでください。</p>
          {mode === "assort" && preview && <LabelExport d={preview} w={paper.w} h={paper.h} name={assort?.productName || "詰合せ"} disabled={blocked} />}
          {mode === "each" && shown.length > 0 && <p className="text-xs text-muted">画像（PNG・SVG）は、上の商品ごとのボタンで書き出せます。</p>}
        </section>
      </div>
      {printing && <PrintGrid labels={labels} paper={paper} start={start} />}
    </div>
  );
}

/** よく使う詰め合わせの一覧。多くなっても探せるように、名前と中の品目で絞りこむ */
function SetList({ sets, current, canEdit, onLoad, onDrop, nameOf }: {
  sets: LabelSet[]; current: string | null; canEdit: boolean;
  onLoad: (s: LabelSet) => void; onDrop: (s: LabelSet) => void; nameOf: (r: Row) => string;
}) {
  const [open, setOpen] = useState(current === null);
  const [q, setQ] = useState("");
  const sorted = useMemo(() => sets.slice().sort((a, b) => a.name.localeCompare(b.name, "ja")), [sets]);
  const k = toMatchKey(q);
  const shown = q.trim() ? sorted.filter((s) => [s.name, ...s.rows.map(nameOf)].some((x) => toMatchKey(x).includes(k))) : sorted;
  const cur = sets.find((s) => s.id === current);
  return (
    <section className={`${ui.card} space-y-2`}>
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className={`${ui.label} flex-1`}>よく使う詰め合わせ（{sets.length}件）{!open && cur && <span className="ml-2 font-bold text-ink">「{cur.name}」を呼び出し中</span>}</span>
        <span className="text-xs text-clay-strong underline">{open ? "閉じる" : "一覧を開く"}</span>
      </button>
      {open && (
        <>
          {sets.length > 5 && <input className={input} placeholder="名前・中の品目で探す" value={q} onChange={(e) => setQ(e.target.value)} />}
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {shown.map((s) => (
              <li key={s.id} className={`flex items-center gap-2 px-3 py-2 ${current === s.id ? "bg-clay-soft" : ""}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => { onLoad(s); setOpen(false); }}>
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted">{s.rows.map((r) => `${nameOf(r)}×${r.count}`).join("、")}</span>
                </button>
                <span className="shrink-0 text-xs text-clay-strong">呼び出す</span>
                {canEdit && <button aria-label="消す" className="shrink-0 p-1 text-faint" onClick={() => onDrop(s)}><Icon name="trash" className="h-4 w-4" /></button>}
              </li>
            ))}
            {!shown.length && <li className="px-3 py-2 text-sm text-muted">見つかりません。</li>}
          </ul>
        </>
      )}
    </section>
  );
}

function labelInfoForOrg(s: ReturnType<typeof useOrgCtx>["org"]["settings"]): LabelInfo {
  return {
    productName: "詰合せ", storage: s.labelStorage || "直射日光・高温多湿を避けて保存してください", expiryDays: s.labelExpiryDays, expiryKind: s.labelExpiryKind,
    dateOutside: s.labelDateOutside, datePrint: s.labelDatePrint, manufacturer: s.manufacturer, manufacturerAddress: s.manufacturerAddress,
  };
}

function problemsOf(info: LabelInfo, b: BuiltLabel): string[] {
  const out = labelMissing(info).map((m) => `${m}が空`);
  if (b.unconfirmed.length) out.push(`アレルゲン未確認（${b.unconfirmed.join("、")}）`);
  if (b.unlinked.length) out.push(`材料が結びついていない（${b.unlinked.join("、")}）`);
  return out;
}
