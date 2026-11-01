// レシート・納品書から仕入れ値を入れる：撮る → まとめて読み取る（1枚1クレジット）→ 明細ごとにお店の材料を確かめて反映。
// 撮影と一覧は「写真から取り込み」と同じ部品（一覧はお店ごと・この画面専用にためる）。値段が変わると原価の計算し直しと値段の記録は材料のトリガが行う
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiMatchCredits, CREDIT_COST, INVOICE_MAX_PHOTOS } from "@shared/credits";
import { PRICE_TAX_OPTIONS, yen } from "@shared/cost";
import { fromPurchaseLines, invoicePatch, INVOICE_UNITS, per100, type InvoiceLine } from "@shared/invoice";
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

/** tried＝AIで探した（見つからなかった行をもう一度クレジットで探さない） */
type Row = InvoiceLine & { use: boolean; target: string; tried?: boolean };
const NEW = "__new__";
/** 読んだ明細を画面の行にする。お店の材料に無くても、共有の材料（成分表つき）が見つかれば「新しく登録」を選んでおく */
const toRow = (l: InvoiceLine, min: number): Row => {
  if (l.ingredientId) return { ...l, use: l.confidence >= min, target: l.ingredientId };
  if (l.global) return { ...l, use: l.global.confidence >= 0.6, target: NEW };
  return { ...l, use: false, target: "" };
};
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
      setRows((cur) => [...cur, ...r.lines.map((l) => toRow(l, 0.5))]);
      setMsg(`${r.read}枚から${r.lines.length}行を読み取りました${r.read < r.photos ? `（${r.photos - r.read}枚は読めず、その分のクレジットは使っていません）` : ""}。結び先と値段を確かめて「反映」を押してください。`);
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
    const got = fromPurchaseLines(lines, ings.list);
    if (!got.length) throw new Error("値段の入った明細が見つかりませんでした。");
    setRows((cur) => [...cur, ...got.map((l) => toRow(l, 0.85))]);
    const linked = got.filter((l) => l.ingredientId).length;
    setMsg(`${head}${lines.length}行から${got.length}品を読み込みました（同じ品名は一番新しい値段だけ）。${linked}品は名前で結べました${skipped ? `。読めない${skipped}行は飛ばしました` : ""}。`);
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

  // 名前で結べなかった行（ファイルから読んだ分も写真の分も）を、AIがお店の材料から探す
  // 1回に200行まで（サーバーの上限）。残りはもう一度押す
  const loose = rows.map((r, k) => ({ r, k })).filter(({ r }) => !r.target && !r.tried).slice(0, 200);
  async function aiMatch() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const names = loose.map(({ r }) => r.raw);
      const hints = loose.map(({ r }) => r.generic ?? "");
      const res = await run({
        title: "仕入れ明細の材料をAIで探す", credits: aiMatchCredits(names.length),
        detail: `結び先が決まっていない${names.length}行を、AIがお店の材料から探します。反映するのは確かめてからです。`,
        exec: () => call<{ matches: { ingredientId: string | null; confidence: number; qty: number; unit: Unit; generic: string; global: InvoiceLine["global"] }[] }>("matchPurchaseLines", { orgId, names, hints, requestId: newRequestId() }),
      });
      if (!res) return;
      const at = new Map(loose.map(({ k }, j) => [k, res.matches[j]]));
      setRows((cur) => cur.map((r, k) => {
        const m = at.get(k);
        if (!m || r.target) return r;
        if (!m.ingredientId && !m.global) return { ...r, tried: true, generic: m.generic || r.generic };
        const sized = r.qty === 1 && r.unit === "個" && m.qty > 0;
        return toRow({ ...r, ingredientId: m.ingredientId, confidence: m.confidence, via: "ai", generic: m.generic || r.generic, global: m.global, ...(sized ? { qty: m.qty, unit: m.unit } : {}) }, 0.6);
      }));
      const found = res.matches.filter((m) => m.ingredientId).length;
      const fresh = res.matches.filter((m) => !m.ingredientId && m.global).length;
      setMsg(`AIが${names.length}行のうち${found}行をお店の材料に結びました${fresh ? `。${fresh}行はお店に無い材料なので、共有の材料（成分表つき）として新しく登録します` : ""}。確かめてから「反映」を押してください。`);
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
          const name = g?.name ?? r.global.name;
          await createIngredient(orgId, uid, { name, globalRef: r.global.id, allergens: suggestAllergens([], `${r.raw} ${name}`, g?.allergens ?? []), ...invoicePatch(r, { name }) });
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

  const set = (k: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === k ? { ...r, ...p } : r)));
  const picked = rows.filter((r) => r.use && r.target).length;
  if (!canEdit) return <p className="py-10 text-center text-muted">仕入れ値の更新には編集の権限が必要です。</p>;
  return (
    <div className="space-y-4 pb-10">
      <PageHead title="レシート・納品書から仕入れ値" back="/ingredients" />
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
      {inbox.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-clay bg-clay-soft p-4">
          <p className="font-bold">AI経理から届いた明細：{inbox.length}枚（{inboxLines}行）</p>
          <p className="text-sm text-ink-soft">AI経理で承認したレシートの明細です。読み込むと下に並ぶので、確かめてから反映してください（無料）。</p>
          <button type="button" disabled={busy} onClick={loadInbox} className={`w-full ${ui.primary}`}>読み込む</button>
        </section>
      )}
      <section className={`${ui.card} space-y-2`}>
        <p className="font-bold">仕入れ明細ファイルを読み込む（無料）</p>
        <p className="text-sm text-ink-soft">
          経理アプリ「<a href={KEIRI_URL} target="_blank" rel="noreferrer" className="underline">AI経理</a>」を使っているお店は、レシートを撮った明細を「仕入れ明細ファイル」として書き出せます（設定の「AI経理と連携」でつなぐと、ファイルを渡さなくても自動で届きます）。それを読み込むと、撮り直さずに仕入れ値を入れられます（同じ形の CSV なら、ほかのアプリや手で作ったものでも読めます）。
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
          {loose.length > 0 && (
            <button disabled={busy} onClick={aiMatch} className={`w-full ${ui.secondary}`}>
              結び先が無い{loose.length}行をAIで探す<CostTag credits={aiMatchCredits(loose.length)} />
            </button>
          )}
          <ul className="space-y-2">
            {rows.map((r, k) => {
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
                    <select className={`${input} min-w-0 flex-1`} value={r.target} onChange={(e) => set(k, { target: e.target.value, use: !!e.target.value })}>
                      <option value="">結ばない</option>
                      <option value={NEW}>{r.global ? `新しく登録：${r.global.name}（成分表・アレルゲンつき）` : "新しい材料として登録"}</option>
                      {sorted.map((i) => <option key={i.id} value={i.id}>{i.name}{i.id === r.ingredientId ? (r.via === "name" ? "（名前が同じ）" : r.via === "similar" ? "（似た名前）" : `（AI ${Math.round(r.confidence * 100)}%）`) : ""}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input className={`${input} w-24`} inputMode="decimal" value={r.price} onChange={(e) => set(k, { price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                    <span className="text-sm">円で</span>
                    <input className={`${input} w-16`} inputMode="decimal" value={r.qty} onChange={(e) => set(k, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                    <select className={input} value={r.unit} onChange={(e) => set(k, { unit: e.target.value as Unit })}>{INVOICE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                    <select className={input} value={r.tax} onChange={(e) => set(k, { tax: Number(e.target.value) })}>{PRICE_TAX_OPTIONS.map((o) => <option key={o.rate} value={o.rate}>{o.label}</option>)}</select>
                  </div>
                  <Per100Line r={r} ing={ing} />
                  {before && <p className="text-xs text-muted">{before}</p>}
                </li>
              );
            })}
          </ul>
          <button disabled={busy || !picked} onClick={apply} className={`sticky bottom-20 w-full ${ui.primary}`}>{busy ? "反映しています…" : `選んだ${picked}件を仕入れ値に反映`}</button>
        </section>
      )}

      {shooting && (
        <CameraShooter count={count} lastUrl={tray.items.at(-1)?.url} onShot={(f) => tray.add([f], "camera")}
          onClose={() => setShooting(false)} onUnavailable={() => setShooting(false)} />
      )}
    </div>
  );
}

/** 100g あたりの値段（税抜）と、AIの判断（一般名）。今の仕入れ値より上がったか下がったかも出す */
function Per100Line({ r, ing }: { r: Row; ing?: { purchasePrice: number | null; purchaseQty: number; purchaseUnit: string } }) {
  const now = per100(r.price, r.tax, r.qty, r.unit);
  const before = ing && ing.purchasePrice !== null ? per100(ing.purchasePrice, 0, ing.purchaseQty, ing.purchaseUnit as Unit) : null;
  const diff = now !== null && before ? Math.round(((now - before) / before) * 100) : null;
  if (now === null && !r.generic) return null;
  return (
    <p className="text-xs text-ink-soft">
      {now !== null && <>100gあたり <b>{yen(now)}</b>（税抜）</>}
      {diff !== null && diff !== 0 && <span className={diff > 0 ? "text-ng" : "text-ok"}>　前より{diff > 0 ? `${diff}%高い` : `${-diff}%安い`}</span>}
      {r.generic && <span className="text-muted">{now !== null ? "　" : ""}AIの判断：{r.generic}</span>}
    </p>
  );
}
