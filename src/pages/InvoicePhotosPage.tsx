// レシート・納品書から仕入れ値を入れる：撮る → まとめて読み取る（1枚1クレジット）→ 明細ごとにお店の材料を確かめて反映。
// 撮影と一覧は「写真から取り込み」と同じ部品（一覧はお店ごと・この画面専用にためる）。値段が変わると原価の計算し直しと値段の記録は材料のトリガが行う
import { shopNameFor } from "@shared/mext";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiMatchCredits, CREDIT_COST, INVOICE_MAX_PHOTOS, SIZE_SEARCH_MAX, sizeSearchCredits } from "@shared/credits";
import { PRICE_TAX_OPTIONS, yen } from "@shared/cost";
import { fromPurchaseLines, ignoreKey, invoicePatch, INVOICE_UNITS, isPieceUnit, needsWebSize, per100, SIZE_LABEL, sizeDoubt, sizeHint, type InvoiceLine } from "@shared/invoice";
import type { Ingredient } from "@shared/types";
import { suggestAllergens } from "@shared/allergenGuess";
import type { GlobalIngredient } from "@shared/types";
import { parsePurchaseCsv } from "@shared/purchaseLines";
import type { Unit } from "@shared/units";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCaptureTray, type TrayItem } from "../hooks/useCaptureTray";
import { useIngredients } from "../hooks/useIngredients";
import { createIngredient } from "../lib/ingredientLink";
import { uploadImportPhoto } from "../lib/photos";
import { call, getOnce, newRequestId, removeDoc, saveDoc } from "../lib/store";
import { useCol } from "../hooks/useData";
import type { PurchaseLine } from "@shared/purchaseLines";
import { PageHead } from "../components/common/Layout";
import { CostTag } from "../components/common/CreditBadge";
import { Icon } from "../components/common/Icon";
import { useCreditAction } from "../components/common/useCreditAction";
import { ui } from "../components/common/ui";
import { CameraShooter } from "../components/import/CameraShooter";
import { CaptureTray } from "../components/import/CaptureTray";
import { numText } from "../lib/num";
import { WebSources } from "../components/common/WebSources";
import { IngredientPicker } from "../components/ingredient/IngredientPicker";
import { cheapestPer100 } from "@shared/offers";

/** tried＝AIで探した（見つからなかった行をもう一度クレジットで探さない）、sizeTried＝AIで量を確かめた、webTried＝ネットで確かめた */
type Row = InvoiceLine & { use: boolean; target: string; tried?: boolean; sizeTried?: boolean; webTried?: boolean };
const NEW = "__new__";
/** 読んだ明細を画面の行にする。お店の材料に無くても、共有の材料（成分表つき）が見つかれば「新しく登録」を選んでおく */
const toRow = (l: InvoiceLine, min: number): Row => {
  if (l.notIngredient && !l.ingredientId) return { ...l, use: false, target: "" };
  if (l.ingredientId) return { ...l, use: l.confidence >= min, target: l.ingredientId };
  if (l.global) return { ...l, use: l.global.confidence >= 0.6, target: NEW };
  return { ...l, use: false, target: "" };
};
/** 除外した品の文書の id（照合キーは日本語なので、そのまま id にできる形にする） */
const ignoreId = (raw: string) => encodeURIComponent(ignoreKey(raw)).slice(0, 400);
const SAVE_KEY = (orgId: string) => `cookon-invoice-${orgId}`;
/** AI経理（別のアプリ）。仕入れ明細ファイルを書き出せる */
const KEIRI_URL = "https://keiri.iwakuni-design.com";

/** CSV の文字を読む。Excel で保存した Shift_JIS にも対応 */
async function readText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  return utf8.includes("\uFFFD") ? new TextDecoder("shift_jis").decode(buf) : utf8;
}

export function InvoicePhotosPage() {
  const { orgId, uid, org, canEdit } = useOrgCtx();
  const ings = useIngredients(orgId);
  const run = useCreditAction(org.credits);
  const batch = useRef(newRequestId());
  const sent = useRef(new Map<string, string>());
  const send = useCallback(async (it: TrayItem) => {
    sent.current.set(it.id, await uploadImportPhoto(orgId, batch.current, it.id, it.file));
  }, [orgId]);
  // 写真から取り込みの一覧と混ざらないよう、ためる場所を分ける
  const tray = useCaptureTray(`${orgId}:invoice`, send);
  const [shooting, setShooting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  // 読み取った明細は、画面を閉じても消えないよう端末に残す（クレジットを使った結果なので）
  const [rows, setRows] = useState<Row[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY(orgId)) ?? "[]") as Row[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(SAVE_KEY(orgId), JSON.stringify(rows)); }, [rows, orgId]);

  // 「今後も読み込まない」にした品（お店ごと。organizations/{orgId}/purchaseIgnore/{ignoreKey}）
  const ignored = useCol<{ name: string }>(`organizations/${orgId}/purchaseIgnore`).list;
  const ignoreSet = useMemo(() => new Set(ignored.map((d) => d.id)), [ignored]);
  /** 除外した品を外して行にする。外した数も返す */
  const fresh = (lines: InvoiceLine[], min: number): [Row[], number] => {
    const keep = lines.filter((l) => !ignoreSet.has(ignoreId(l.raw)));
    return [keep.map((l) => toRow(l, min)), lines.length - keep.length];
  };
  const ignoreNote = (n: number) => (n ? `（前に「今後も読み込まない」にした${n}行は飛ばしました）` : "");
  /** 行を消して、同じ品名を今後も読み込まないように覚える */
  async function ignoreRows(ks: number[]) {
    const targets = ks.map((k) => rows[k]).filter(Boolean);
    setRows((cur) => cur.filter((_, j) => !ks.includes(j)));
    try {
      await Promise.all(targets.map((r) => {
        return ignoreKey(r.raw) ? saveDoc(`organizations/${orgId}/purchaseIgnore/${ignoreId(r.raw)}`, { name: r.raw.slice(0, 80) }) : undefined;
      }));
      setMsg(`${targets.length}行を除外しました。同じ品名は次から読み込みません（この画面のいちばん下の「除外した品」で戻せます）。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const count = tray.items.length;
  const credits = count * CREDIT_COST.invoicePhoto;
  const byId = useMemo(() => new Map(ings.list.map((i) => [i.id, i])), [ings.list]);
  const sorted = useMemo(() => [...ings.list].sort((a, b) => a.name.localeCompare(b.name, "ja")), [ings.list]);

  async function readAll() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const r = await run({
        title: "レシート・納品書を読み取る", credits,
        detail: `${count}枚から明細を読み取り、お店の材料と結びつけます。反映するのは確かめてからです。`,
        exec: async () => {
          const failed = await tray.sendAll();
          if (failed) throw new Error(`${failed}枚を送れませんでした。電波の良い場所で、もう一度押してください。クレジットは使われていません。`);
          const paths = tray.items.map((i) => sent.current.get(i.id)).filter((p): p is string => !!p);
          const res = await call<{ lines: InvoiceLine[]; read: number; photos: number }>("readInvoices", { orgId, batchId: batch.current, paths, requestId: newRequestId() });
          tray.clearSent();
          batch.current = newRequestId();
          sent.current.clear();
          return res;
        },
      });
      if (!r) return;
      const [got, skippedN] = fresh(r.lines, 0.5);
      setRows((cur) => [...cur, ...got]);
      setMsg(`${r.read}枚から${r.lines.length}行を読み取りました${ignoreNote(skippedN)}${r.read < r.photos ? `（${r.photos - r.read}枚は読めず、その分のクレジットは使っていません）` : ""}。結び先と値段を確かめて「反映」を押してください。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // AI経理から自動で届いた明細（設定で連携したお店だけ）
  const inbox = useCol<{ lines: PurchaseLine[]; sender: string }>(`organizations/${orgId}/purchaseInbox`).list;
  const inboxLines = inbox.reduce((n, d) => n + (d.lines?.length ?? 0), 0);
  async function loadInbox() {
    setErr("");
    setMsg("");
    try {
      const lines = inbox.flatMap((d) => d.lines ?? []);
      addLines(lines, 0, `AI経理から届いた${inbox.length}枚・`);
      await Promise.all(inbox.map((d) => removeDoc(`organizations/${orgId}/purchaseInbox/${d.id}`)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function addLines(lines: PurchaseLine[], skipped: number, head = "") {
    const all = fromPurchaseLines(lines, ings.list);
    if (!all.length) throw new Error("値段の入った明細が見つかりませんでした。");
    const [got, skippedN] = fresh(all, 0.85);
    setRows((cur) => [...cur, ...got]);
    const linked = got.filter((l) => l.ingredientId).length;
    const nf = got.filter((l) => l.notIngredient && !l.target).length;
    setMsg(`${head}${lines.length}行から${got.length}品を読み込みました（同じ品名は一番新しい値段だけ）${ignoreNote(skippedN)}。${linked}品は名前で結べました${nf ? `。材料ではなさそうな${nf}品は下にまとめました` : ""}${skipped ? `。読めない${skipped}行は飛ばしました` : ""}。`);
  }

  async function loadFile(f: File) {
    setErr("");
    setMsg("");
    try {
      const { lines, skipped } = parsePurchaseCsv(await readText(f));
      addLines(lines, skipped);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  // AIに判断してもらう行：名前で結べなかった行（材料を探す＋量）と、結び先はあるが量が怪しい行（量だけ）。
  // 量が怪しい＝量が分からない・個で買うのに1つの重さが分からない・今の材料の100gあたりと大きく違う。1回に200行まで（サーバーの上限）
  const doubt = (r: Row) => (r.sizeTried ? null : sizeDoubt(r, byId.get(r.target)));
  const todo = rows.map((r, k) => ({ r, k }))
    .filter(({ r }) => (!r.target && !r.tried && !r.notIngredient) || (!!r.target && !!doubt(r)))
    .slice(0, 200);
  const looseN = todo.filter(({ r }) => !r.target).length;
  const sizeN = todo.length - looseN;
  async function aiMatch() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const names = todo.map(({ r }) => r.raw);
      const hints = todo.map(({ r }) => r.generic ?? "");
      const fixed = todo.map(({ r }) => !!r.target);
      const clues = todo.map(({ r }) => sizeHint(r, byId.get(r.target)));
      type Match = Pick<InvoiceLine, "ingredientId" | "confidence" | "qty" | "unit" | "generic" | "global" | "size" | "sizeNote" | "gramsPerPiece" | "notIngredient">;
      const res = await run({
        title: "仕入れ明細をAIで判断する", credits: aiMatchCredits(names.length),
        detail: `${[looseN && `結び先が決まっていない${looseN}行はお店の材料から探し`, sizeN && `${sizeN}行は量（重さ・入り数・1つの重さ）を品名と値段から確かめ`].filter(Boolean).join("、")}ます。反映するのは確かめてからです。`,
        exec: () => call<{ matches: Match[] }>("matchPurchaseLines", { orgId, names, hints, fixed, clues, requestId: newRequestId() }),
      });
      if (!res) return;
      const at = new Map(todo.map(({ k }, j) => [k, res.matches[j]]));
      let sized = 0;
      // 押している間は行を変えられない（busy）ので、今の行から作り直す
      setRows(rows.map((r, k) => {
        const m = at.get(k);
        if (!m) return r;
        // 量：人が直した量は変えない。AIが「分からない」なら今のまま
        const useSize = r.size !== "edited" && m.size !== "none" && m.qty > 0 && (m.qty !== r.qty || m.unit !== r.unit || r.size !== m.size);
        const gpp = r.size !== "edited" && m.gramsPerPiece && isPieceUnit(useSize ? m.unit : r.unit) ? m.gramsPerPiece : r.gramsPerPiece;
        if (useSize || gpp !== r.gramsPerPiece) sized++;
        const size: Partial<Row> = {
          sizeTried: true, gramsPerPiece: gpp ?? null,
          ...(useSize ? { qty: m.qty, unit: m.unit, size: m.size, sizeNote: m.sizeNote } : {}),
        };
        if (r.target) return { ...r, ...size };
        if (m.notIngredient) return { ...r, ...size, tried: true, notIngredient: true, use: false };
        if (!m.ingredientId && !m.global) return { ...r, ...size, tried: true, generic: m.generic || r.generic };
        return toRow({ ...r, ...size, ingredientId: m.ingredientId, confidence: m.confidence, via: "ai", generic: m.generic || r.generic, global: m.global }, 0.6);
      }));
      const found = res.matches.filter((m, j) => !fixed[j] && m.ingredientId).length;
      const nfN = res.matches.filter((m, j) => !fixed[j] && m.notIngredient).length;
      const fresh = res.matches.filter((m, j) => !fixed[j] && !m.ingredientId && m.global).length;
      setMsg([
        looseN && `AIが${looseN}行のうち${found}行をお店の材料に結びました${fresh ? `（${fresh}行はお店に無い材料なので、共有の材料（成分表つき）として新しく登録します）` : ""}。`,
        nfN && `${nfN}行は材料ではなさそうなので、下の「材料ではなさそうな品」に移しました。`,
        sized && `${sized}行の量をAIが判断しました（黄色の「AIの推定」は確かめてください）。`,
        "確かめてから「反映」を押してください。",
      ].filter(Boolean).join(""));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // AIでも量を決めきれなかった行（値段からの推定・分からない・量が怪しい）を、Google 検索つきのAIで1品ずつ確かめる。
  // ほかのお店が前に調べた商品は共有の表から無料で入る。まずは「AIで判断する」を済ませた行だけ（安いほうを先に）
  const web = rows.map((r, k) => ({ r, k }))
    .filter(({ r }) => r.sizeTried && !r.webTried && (r.target || r.global) && needsWebSize(r, byId.get(r.target)))
    .slice(0, SIZE_SEARCH_MAX);
  async function webSize() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const lines = web.map(({ r }) => ({ name: r.raw, generic: r.generic ?? "", price: r.price, tax: r.tax, clue: sizeHint(r, byId.get(r.target)) }));
      type Res = Pick<InvoiceLine, "qty" | "unit" | "gramsPerPiece" | "sizeNote" | "sizeSources" | "sizeSearchHtml"> & { found: boolean; shared: boolean };
      const res = await run({
        title: "量をネットで確かめる", credits: sizeSearchCredits(lines.length),
        detail: `${lines.length}品の内容量を、AIが Google 検索で商品のページを探して確かめます。ほかのお店が前に調べた商品はクレジットを使いません（使わなかった分は戻ります）。`,
        exec: () => call<{ results: Res[]; searched: number }>("searchPackSizes", { orgId, lines, requestId: newRequestId() }),
      });
      if (!res) return;
      const at = new Map(web.map(({ k }, j) => [k, res.results[j]]));
      setRows(rows.map((r, k) => {
        const m = at.get(k);
        if (!m) return r;
        if (!m.found) return { ...r, webTried: true };
        return {
          ...r, webTried: true, qty: m.qty, unit: m.unit, size: "web", sizeNote: m.sizeNote, sizeSources: m.sizeSources, sizeSearchHtml: m.sizeSearchHtml,
          gramsPerPiece: isPieceUnit(m.unit) ? (m.gramsPerPiece ?? r.gramsPerPiece ?? null) : null,
        };
      }));
      const found = res.results.filter((m) => m.found).length;
      const shared = res.results.filter((m) => m.shared).length;
      setMsg(`${lines.length}品のうち${found}品の量をネットで確かめました${shared ? `（${shared}品はほかのお店が調べた結果で、クレジットは使っていません）` : ""}。見つからなかった品は、袋の表示を見て量を直してください。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setErr("");
    let done = 0;
    try {
      for (const r of rows.filter((x) => x.use && x.target)) {
        const same = r.target === NEW && r.global ? ings.list.find((i) => i.globalRef === r.global!.id) : undefined;
        if (same) {
          // 同じ共有の材料に結んだ材料がもうある（同じファイルの別の行で登録したなど）なら、その値段を直す
          await saveDoc(`organizations/${orgId}/ingredients/${same.id}`, invoicePatch(r, same));
        } else if (r.target === NEW && r.global) {
          // 共有の材料（成分表の成分・アレルゲン）に結んで登録。名前は共有の名前、レシートの表記は別名に覚える
          const g = await getOnce<GlobalIngredient>(`globalIngredients/${r.global.id}`);
          const name = shopNameFor(r.global.id, g?.name ?? r.global.name, r.generic ?? "");
          await createIngredient(orgId, uid, { name, globalRef: r.global.id, allergens: suggestAllergens([], `${r.raw} ${name}`, g?.allergens ?? [], r.global.id), ...invoicePatch(r, { name }) });
        } else if (r.target === NEW) {
          const p = invoicePatch(r, { name: r.raw });
          await createIngredient(orgId, uid, { name: r.raw.slice(0, 60), allergens: suggestAllergens([], r.raw), ...p, aliases: [] });
        } else {
          const ing = byId.get(r.target);
          if (!ing) continue;
          await saveDoc(`organizations/${orgId}/ingredients/${ing.id}`, invoicePatch(r, ing));
        }
        done++;
      }
      setRows((cur) => cur.filter((x) => !(x.use && x.target)));
      setMsg(`${done}件の仕入れ値を更新しました。使っているレシピの原価は自動で計算し直します（前の値段は材料の「値段の記録」に残ります）。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できなかった行があります。");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: number, p: Partial<Row>) => setRows((cur) => cur.map((r, j) => (j === k ? { ...r, ...p } : r)));
  const picked = rows.filter((r) => r.use && r.target).length;
  if (!canEdit) return <p className="py-10 text-center text-muted">仕入れ値の更新には編集の権限が必要です。</p>;
  return (
    <div className="space-y-4 pb-10">
      <PageHead title="仕入れ" />
      {inbox.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-clay bg-clay-soft p-4">
          <p className="font-bold">AI経理から届いた明細：{inbox.length}枚（{inboxLines}行）</p>
          <p className="text-sm text-ink-soft">AI経理で承認したレシートの明細です。読み込むと下に並ぶので、確かめてから反映してください（無料）。</p>
          <button type="button" disabled={busy} onClick={loadInbox} className={`w-full ${ui.primary}`}>読み込む</button>
        </section>
      )}
      <p className="text-sm text-ink-soft">
        仕入れのレシート・納品書・請求書を撮ると、AIが明細を読んで、お店の材料と結びつけます。季節で変わる値段も、撮るだけで原価に反映できます。仕入れ明細ファイルの読み込みもできます。反映するのは確かめてからです。
      </p>
      <button type="button" onClick={() => setShooting(true)} disabled={busy}
        className="flex h-32 w-full flex-col items-center justify-center rounded-2xl border border-line bg-paper">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clay text-white"><Icon name="receipt" className="h-6 w-6" /></span>
        <span className="mt-2 font-bold">続けて撮影する</span>
      </button>
      <div className="-mt-2 flex justify-center gap-6 text-sm text-muted">
        <label className="cursor-pointer underline">いつものカメラで撮る
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { tray.add(Array.from(e.target.files ?? []), "camera"); e.target.value = ""; }} />
        </label>
        <label className="cursor-pointer underline">写真を選ぶ（複数可）
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { tray.add(Array.from(e.target.files ?? []), "upload"); e.target.value = ""; }} />
        </label>
      </div>
      <section className={`${ui.card} space-y-2`}>
        <p className="font-bold">仕入れ明細ファイルを読み込む（無料）</p>
        <p className="text-sm text-ink-soft">
          経理アプリ「<a href={KEIRI_URL} target="_blank" rel="noreferrer" className="underline">AI経理</a>」を使っているお店は、レシートを撮った明細を「仕入れ明細ファイル」として書き出せます（設定の「<Link to="/settings#keiri" className="underline">AI経理と連携</Link>」でつなぐと、ファイルを渡さなくても自動で届きます）。それを読み込むと、撮り直さずに仕入れ値を入れられます（同じ形の CSV なら、ほかのアプリや手で作ったものでも読めます）。
        </p>
        <label className={`block cursor-pointer text-center ${ui.secondary} ${busy ? "pointer-events-none opacity-50" : ""}`}>
          ファイルを選ぶ（.csv）
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} />
        </label>
      </section>
      <CaptureTray items={tray.items} onRemove={tray.remove} busy={busy} onRetake={() => undefined} />
      {count > INVOICE_MAX_PHOTOS && <p className="text-sm text-ng">1回に読めるのは{INVOICE_MAX_PHOTOS}枚までです。</p>}
      {count > 0 && (
        <button disabled={busy || count > INVOICE_MAX_PHOTOS} onClick={readAll} className={`w-full ${ui.primary}`}>
          {busy ? (tray.progress || "読み取っています…") : `${count}枚を読み取る`}{!busy && <CostTag credits={credits} />}
        </button>
      )}
      {err && <p className="rounded-xl bg-ng-soft p-3 text-sm text-ng-strong">{err}</p>}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}

      {rows.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold">読み取った明細（{rows.length}行）</h2>
            <button className="text-xs text-muted underline" onClick={() => setRows([])}>全部消す</button>
          </div>
          {todo.length > 0 && (
            <button disabled={busy} onClick={aiMatch} className={`w-full ${ui.secondary}`}>
              AIで判断する：{[looseN && `結び先が無い${looseN}行`, sizeN && `量を確かめる${sizeN}行`].filter(Boolean).join("・")}<CostTag credits={aiMatchCredits(todo.length)} />
            </button>
          )}
          {web.length > 0 && !busy && (
            <button onClick={webSize} className={`w-full ${ui.secondary}`}>
              量が決まらない{web.length}品をネットで確かめる<CostTag credits={sizeSearchCredits(web.length)} />
            </button>
          )}
          <ul className="space-y-2">
            {rows.map((r, k) => {
              if (r.notIngredient && !r.target) return null;
              const ing = byId.get(r.target);
              const before = ing && ing.purchasePrice !== null ? `今 ${yen(ing.purchasePrice)}（税抜）/${ing.purchaseQty}${ing.purchaseUnit}` : ing ? "今は値段なし" : "";
              const input = "rounded-lg border border-line-strong bg-paper px-2 py-1 text-sm";
              return (
                <li key={k} className={`${ui.card} space-y-1.5 ${r.use ? "" : "opacity-60"}`}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-clay" checked={r.use} onChange={(e) => set(k, { use: e.target.checked })} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{r.raw}</span>
                      <span className="block text-xs text-muted">{[r.supplier, r.date, r.photo < 0 ? (r.count > 1 ? `ファイル・${r.count}回の仕入れ` : "ファイル") : `写真${r.photo + 1}`, r.photo >= 0 && r.count > 1 ? `${r.count}つ` : ""].filter(Boolean).join("・")}</span>
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-faint">→</span>
                    <IngredientPicker className="flex-1" value={r.target} list={sorted} hintOf={r.generic || r.raw}
                      onPick={(id) => set(k, { target: id, use: !!id })}
                      extras={[{ value: "", label: "結ばない" }, { value: NEW, label: r.global ? `新しく登録：${shopNameFor(r.global.id, r.global.name, r.generic ?? "")}（成分表・アレルゲンつき）` : `新しい材料として登録：${r.raw.slice(0, 30)}` }]}
                      labelOf={(i) => `${i.name}${i.id === r.ingredientId ? (r.via === "name" ? "（名前が同じ）" : r.via === "similar" ? "（似た名前）" : `（AI ${Math.round(r.confidence * 100)}%）`) : ""}`} />
                    <button type="button" className="shrink-0 text-xs text-muted underline" onClick={() => void ignoreRows([k])} title="この品名は次から読み込みません">除外</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input className={`${input} w-24`} inputMode="decimal" value={r.price} onChange={(e) => set(k, { price: Number(numText(e.target.value)) || 0 })} />
                    <span className="text-sm">円で</span>
                    <input className={`${input} w-16`} inputMode="decimal" value={r.qty} onChange={(e) => set(k, { qty: Number(numText(e.target.value)) || 0, size: "edited" })} />
                    <select className={input} value={r.unit} onChange={(e) => set(k, { unit: e.target.value as Unit, size: "edited" })}>{INVOICE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                    <select className={input} value={r.tax} onChange={(e) => set(k, { tax: Number(e.target.value) })}>{PRICE_TAX_OPTIONS.map((o) => <option key={o.rate} value={o.rate}>{o.label}</option>)}</select>
                  </div>
                  {isPieceUnit(r.unit) && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted">1{r.unit}あたり 約</span>
                      <input className={`${input} w-16`} inputMode="decimal" placeholder={ing?.gramsPerPiece ? String(ing.gramsPerPiece) : ""} value={r.gramsPerPiece ?? ""}
                        onChange={(e) => set(k, { gramsPerPiece: Number(numText(e.target.value)) || null })} />
                      <span className="text-muted">g（100gあたりの値段と原価の計算に使います）</span>
                    </div>
                  )}
                  <Per100Line r={r} ing={ing} doubt={doubt(r) ?? (r.sizeTried ? sizeDoubt(r, ing) : null)} />
                  {before && <p className="text-xs text-muted">{before}</p>}
                </li>
              );
            })}
          </ul>
          <NonFood rows={rows} busy={busy} onIgnore={(ks) => void ignoreRows(ks)} onKeep={(k) => set(k, { notIngredient: false })} />
          <button disabled={busy || !picked} onClick={apply} className={`sticky bottom-20 w-full ${ui.primary}`}>{busy ? "反映しています…" : `選んだ${picked}件を仕入れ値に反映`}</button>
        </section>
      )}

      {ignored.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">除外した品（{ignored.length}）：次から読み込みません</summary>
          <ul className="mt-2 divide-y divide-line">
            {ignored.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <button type="button" className="shrink-0 text-xs text-clay-strong underline" onClick={() => void removeDoc(`organizations/${orgId}/purchaseIgnore/${d.id}`)}>戻す</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {shooting && (
        <CameraShooter count={count} lastUrl={tray.items.at(-1)?.url} onShot={(f) => tray.add([f], "camera")}
          onClose={() => setShooting(false)} onUnavailable={() => setShooting(false)} />
      )}
    </div>
  );
}

/** 材料ではなさそうな品（ゴミ袋・ケーブル・軽食など）。まとめて除外する（同じ品名は次から読み込まない）か、材料として扱う */
function NonFood({ rows, busy, onIgnore, onKeep }: { rows: Row[]; busy: boolean; onIgnore: (ks: number[]) => void; onKeep: (k: number) => void }) {
  const list = rows.map((r, k) => ({ r, k })).filter(({ r }) => r.notIngredient && !r.target);
  if (!list.length) return null;
  return (
    <details className={`${ui.card} space-y-2`}>
      <summary className="cursor-pointer font-bold">材料ではなさそうな品（{list.length}行）</summary>
      <p className="text-xs text-muted">日用品・家電・お店で食べた軽食など、名前やAIの判断で材料・包装資材ではなさそうな品です。反映には入りません。材料なら「材料として扱う」を押してください。</p>
      <ul className="divide-y divide-line text-sm">
        {list.map(({ r, k }) => (
          <li key={k} className="flex items-baseline gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">{r.raw}<span className="ml-1 text-xs text-muted">{yen(r.price)}{r.supplier ? `・${r.supplier}` : ""}</span></span>
            <button type="button" className="shrink-0 text-xs text-clay-strong underline" onClick={() => onKeep(k)}>材料として扱う</button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={busy} onClick={() => onIgnore(list.map((x) => x.k))} className={`w-full ${ui.secondary}`}>{list.length}行をまとめて除外する（次から読み込まない）</button>
    </details>
  );
}

/** 100g あたりの値段（税抜）と、AIの判断（一般名・量の根拠）。今の仕入れ値より上がったか下がったか、量が怪しければその理由も出す */
function Per100Line({ r, ing, doubt }: { r: Row; ing?: Ingredient; doubt: string | null }) {
  const now = per100(r.price, r.tax, r.qty, r.unit, r.gramsPerPiece ?? ing?.gramsPerPiece);
  const before = ing && ing.purchasePrice !== null ? per100(ing.purchasePrice, 0, ing.purchaseQty, ing.purchaseUnit, ing.gramsPerPiece) : null;
  const diff = now !== null && before ? Math.round(((now - before) / before) * 100) : null;
  const guess = r.size === "known" || r.size === "price" || r.size === "web";
  // 材料の画面で「ネットで値段を比べる」をしてあれば、いちばん安い売り場とレシートを比べる
  const cheap = cheapestPer100(ing?.offers, r.gramsPerPiece ?? ing?.gramsPerPiece);
  return (
    <div className="space-y-0.5 text-xs">
      {(now !== null || r.generic) && (
        <p className="text-ink-soft">
          {now !== null && <>100gあたり <b>{yen(now)}</b>（税抜）</>}
          {diff !== null && diff !== 0 && !doubt && <span className={diff > 0 ? "text-ng" : "text-ok"}>　前より{diff > 0 ? `${diff}%高い` : `${-diff}%安い`}</span>}
          {r.generic && <span className="text-muted">{now !== null ? "　" : ""}AIの判断：{r.generic}</span>}
        </p>
      )}
      {cheap !== null && now !== null && (
        <p className="text-muted">ネットで比べた最安 {yen(cheap)}/100g（税抜）{now > cheap ? <span className="text-ng">　このレシートは{Math.round(((now - cheap) / cheap) * 100)}%高い</span> : <span className="text-ok">　このレシートのほうが安い</span>}</p>
      )}
      {guess && <p><span className={`rounded px-1.5 py-0.5 ${r.size === "web" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn-strong"}`}>{SIZE_LABEL[r.size!]}</span>{r.sizeNote && <span className="text-muted">　{r.sizeNote}</span>}</p>}
      {r.size === "web" && <WebSources sources={r.sizeSources} searchHtml={r.sizeSearchHtml} />}
      {doubt && <p className="text-ng">量を確かめてください：{doubt}{!r.sizeTried ? "（「AIで判断する」で確かめられます）" : !r.webTried ? "（「ネットで確かめる」で調べられます）" : ""}</p>}
    </div>
  );
}
