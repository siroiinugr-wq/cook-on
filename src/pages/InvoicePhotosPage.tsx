// レシート・納品書から仕入れ値を入れる：撮る → まとめて読み取る（1枚1クレジット）→ 明細ごとにお店の材料を確かめて反映。
// 撮影と一覧は「写真から取り込み」と同じ部品（一覧はお店ごと・この画面専用にためる）。値段が変わると原価の計算し直しと値段の記録は材料のトリガが行う
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CREDIT_COST, INVOICE_MAX_PHOTOS } from "@shared/credits";
import { PRICE_TAX_OPTIONS, yen } from "@shared/cost";
import { invoicePatch, INVOICE_UNITS, type InvoiceLine } from "@shared/invoice";
import type { Unit } from "@shared/units";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCaptureTray, type TrayItem } from "../hooks/useCaptureTray";
import { useIngredients } from "../hooks/useIngredients";
import { createIngredient } from "../lib/ingredientLink";
import { uploadImportPhoto } from "../lib/photos";
import { call, newRequestId, saveDoc } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { CostTag } from "../components/common/CreditBadge";
import { Icon } from "../components/common/Icon";
import { useCreditAction } from "../components/common/useCreditAction";
import { ui } from "../components/common/ui";
import { CameraShooter } from "../components/import/CameraShooter";
import { CaptureTray } from "../components/import/CaptureTray";

type Row = InvoiceLine & { use: boolean; target: string };
const NEW = "__new__";
const SAVE_KEY = (orgId: string) => `cookon-invoice-${orgId}`;

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
      setRows((cur) => [...cur, ...r.lines.map((l) => ({ ...l, use: !!l.ingredientId && l.confidence >= 0.5, target: l.ingredientId ?? "" }))]);
      setMsg(`${r.read}枚から${r.lines.length}行を読み取りました${r.read < r.photos ? `（${r.photos - r.read}枚は読めず、その分のクレジットは使っていません）` : ""}。結び先と値段を確かめて「反映」を押してください。`);
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
        if (r.target === NEW) {
          const p = invoicePatch(r, { name: r.raw });
          await createIngredient(orgId, uid, { name: r.raw.slice(0, 60), allergens: [], ...p, aliases: [] });
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
        仕入れのレシート・納品書・請求書を撮ると、AIが明細を読んで、お店の材料と結びつけます。季節で変わる値段も、撮るだけで原価に反映できます。反映するのは確かめてからです。
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
                      <span className="block text-xs text-muted">{[r.supplier, r.date, `写真${r.photo + 1}`, r.count > 1 ? `${r.count}つ` : ""].filter(Boolean).join("・")}</span>
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-faint">→</span>
                    <select className={`${input} min-w-0 flex-1`} value={r.target} onChange={(e) => set(k, { target: e.target.value, use: !!e.target.value })}>
                      <option value="">結ばない</option>
                      <option value={NEW}>新しい材料として登録</option>
                      {sorted.map((i) => <option key={i.id} value={i.id}>{i.name}{i.id === r.ingredientId ? `（AI ${Math.round(r.confidence * 100)}%）` : ""}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input className={`${input} w-24`} inputMode="decimal" value={r.price} onChange={(e) => set(k, { price: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                    <span className="text-sm">円で</span>
                    <input className={`${input} w-16`} inputMode="decimal" value={r.qty} onChange={(e) => set(k, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                    <select className={input} value={r.unit} onChange={(e) => set(k, { unit: e.target.value as Unit })}>{INVOICE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                    <select className={input} value={r.tax} onChange={(e) => set(k, { tax: Number(e.target.value) })}>{PRICE_TAX_OPTIONS.map((o) => <option key={o.rate} value={o.rate}>{o.label}</option>)}</select>
                  </div>
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
