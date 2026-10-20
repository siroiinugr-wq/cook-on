// 材料の登録・編集。仕入れ値を変えると、使っているレシピの原価が自動で計算し直され、目標を超えたらお知らせが出る
import { useState } from "react";
import { ALLERGENS, type AllergenId } from "@shared/allergens";
import { fromExTax, PRICE_TAX_OPTIONS, toExTax, unitCostPerGram, yen } from "@shared/cost";
import type { Ingredient } from "@shared/types";
import { UNITS, type Unit } from "@shared/units";
import { useCol } from "../../hooks/useData";
import { removeDoc, saveDoc, toDate } from "../../lib/store";
import { createIngredient } from "../../lib/ingredientLink";
import { uploadPhoto } from "../../lib/photos";
import { Accordion } from "../common/Accordion";
import { useConfirm } from "../common/ConfirmDialog";
import { Sheet } from "../common/Sheet";
import { ui } from "../common/ui";
import { GlobalInfo } from "./GlobalInfo";
import { PhotoThumb } from "./PhotoThumb";

const BUY_UNITS = UNITS.filter((u) => u !== "適量");
const PIECE: Unit[] = ["個", "枚", "本"];
const LIQUID: Unit[] = ["ml", "l", "大さじ", "小さじ", "カップ"];
type Hist = { from: { price: number | null; qty: number; unit: string }; to: { price: number | null; qty: number; unit: string }; at: unknown };

export function IngredientSheet({ orgId, uid, ing, usedIn, onClose }: { orgId: string; uid: string; ing: Ingredient | null; usedIn: number; onClose: () => void }) {
  const [d, setD] = useState<Omit<Ingredient, "id">>(ing ?? { name: "", purchasePrice: null, purchaseQty: 1, purchaseUnit: "kg", allergens: [], globalRef: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  const hist = useCol<Hist>(ing ? `organizations/${orgId}/ingredients/${ing.id}/priceHistory` : null, { orderBy: ["at", "desc"], limit: 10 });
  const set = (p: Partial<Ingredient>) => setD({ ...d, ...p });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")));
  // 値段の欄は「入れた形」（税込なら税込）で出し、保存する purchasePrice は税抜に直す
  const tax = d.priceTax ?? 0;
  const [priceText, setPriceText] = useState(d.purchasePrice === null ? "" : String(fromExTax(d.purchasePrice, tax)));
  const setPrice = (text: string, rate = tax) => {
    setPriceText(text);
    const n = num(text);
    set({ purchasePrice: n === null ? null : toExTax(n, rate), priceTax: rate });
  };
  const perG = unitCostPerGram(d);
  const toggle = (a: AllergenId) => set({ allergens: d.allergens.includes(a) ? d.allergens.filter((x) => x !== a) : [...d.allergens, a] });

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const data = {
        name: d.name.trim(), purchasePrice: d.purchasePrice, priceTax: d.priceTax ?? 0, purchaseQty: d.purchaseQty || 1, purchaseUnit: d.purchaseUnit,
        gramsPerPiece: d.gramsPerPiece ?? null, gramsPerMl: d.gramsPerMl ?? null, allergens: d.allergens,
        labelName: d.labelName?.trim() ?? "", isAdditive: !!d.isAdditive, supplier: d.supplier?.trim() ?? "", globalRef: d.globalRef ?? null,
        photoPath: d.photoPath ?? null,
      };
      if (ing) await saveDoc(`organizations/${orgId}/ingredients/${ing.id}`, data);
      else await createIngredient(orgId, uid, data);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした。");
      setBusy(false);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      set({ photoPath: await uploadPhoto(`orgs/${orgId}/ingredients`, file, 800) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を上げられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!ing) return;
    const ok = await confirm({ title: `「${ing.name}」を消しますか？`, body: usedIn ? `${usedIn}件のレシピで使っています。レシピには名前が残りますが、原価とアレルゲンに入らなくなります。` : "元に戻せません。", ok: "消す" });
    if (!ok) return;
    await removeDoc(`organizations/${orgId}/ingredients/${ing.id}`);
    onClose();
  }

  const input = ui.input;
  return (
    <Sheet title={ing ? "材料を直す" : "材料を登録"} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <label className="block flex-1 space-y-1"><span className={ui.label}>材料名</span><input className={input} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
          <PhotoThumb path={d.photoPath} className="h-11 w-11" />
        </div>
        <div className="flex gap-3 text-sm">
          <label className="cursor-pointer text-clay-strong underline">{d.photoPath ? "写真を替える" : "写真を付ける"}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => pickPhoto(e.target.files?.[0])} /></label>
          {d.photoPath && <button type="button" className="text-muted underline" onClick={() => set({ photoPath: null })}>写真を外す</button>}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={ui.label}>仕入れ値</span>
            <div className="flex overflow-hidden rounded-lg border border-line text-xs">
              {PRICE_TAX_OPTIONS.map((o) => (
                <button key={o.rate} type="button" onClick={() => setPrice(priceText, o.rate)}
                  className={`px-2 py-1 ${tax === o.rate ? "bg-clay font-bold text-white" : "text-muted"}`}>{o.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input className={`${input} w-28`} inputMode="decimal" placeholder="未入力" value={priceText} onChange={(e) => setPrice(e.target.value)} />
            <span className="shrink-0 text-sm">円で</span>
            <input className={`${input} w-20`} inputMode="decimal" value={d.purchaseQty} onChange={(e) => set({ purchaseQty: num(e.target.value) ?? 1 })} />
            <select className={`${input} w-24`} value={d.purchaseUnit} onChange={(e) => set({ purchaseUnit: e.target.value as Unit })}>{BUY_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          {tax > 0 && d.purchasePrice !== null && <p className="text-xs text-muted">税抜 {yen(d.purchasePrice)} で原価を計算します。</p>}
          <p className="text-xs text-muted">{perG !== null ? `1gあたり ${yen(perG)}（税抜）／1kgあたり ${yen(perG * 1000)}` : "1gあたりの値段を出すには、仕入れ値と量を入れてください。"}</p>
        </div>
        {d.globalRef && <GlobalInfo globalRef={d.globalRef} onApply={(p) => { setPriceText(String(p.price)); set({ purchasePrice: p.price, priceTax: 0, purchaseQty: p.qty, purchaseUnit: p.unit }); }} />}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={ui.label}>1個・1枚・1本の重さ g{PIECE.includes(d.purchaseUnit) ? "（必要）" : ""}</span>
            <input className={input} inputMode="decimal" value={d.gramsPerPiece ?? ""} onChange={(e) => set({ gramsPerPiece: num(e.target.value) })} /></label>
          <label className="space-y-1"><span className={ui.label}>1mlの重さ g{LIQUID.includes(d.purchaseUnit) ? "（無ければ1）" : ""}</span>
            <input className={input} inputMode="decimal" placeholder="1" value={d.gramsPerMl ?? ""} onChange={(e) => set({ gramsPerMl: num(e.target.value) })} /></label>
        </div>
        <div className="space-y-1">
          <p className={ui.label}>アレルゲン（含むものを押す）</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <button key={a.id} type="button" onClick={() => toggle(a.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${d.allergens.includes(a.id) ? "border-clay bg-clay-soft font-bold text-clay-strong" : a.required ? "border-line-strong" : "border-line text-muted"}`}>{a.name}</button>
            ))}
          </div>
        </div>
        <Accordion title="ラベル・仕入れ先" summary={d.labelName ? `ラベル：${d.labelName}` : "ラベルに出す名前を変えるとき"}>
          <div className="space-y-2">
            <label className="block space-y-1"><span className={ui.label}>ラベルに出す名前（既製品は中身まで。例：チョコレート（砂糖、カカオマス、ココアバター））</span>
              <textarea className={`${input} h-16`} value={d.labelName ?? ""} maxLength={300} onChange={(e) => set({ labelName: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.isAdditive} onChange={(e) => set({ isAdditive: e.target.checked })} />添加物（ラベルで「／」のあとに書く）</label>
            <label className="block space-y-1"><span className={ui.label}>仕入れ先</span><input className={input} value={d.supplier ?? ""} maxLength={60} onChange={(e) => set({ supplier: e.target.value })} /></label>
          </div>
        </Accordion>
        {ing && hist.list.length > 0 && (
          <Accordion title="値段の記録" summary={`${hist.list.length}回変わっています`}>
            <ul className="space-y-1 text-sm">
              {hist.list.map((h) => (
                <li key={h.id} className="flex justify-between gap-2"><span className="text-muted">{toDate(h.at)?.toLocaleDateString("ja-JP") ?? ""}</span>
                  <span>{yen(h.from.price)}/{h.from.qty}{h.from.unit} → <b>{yen(h.to.price)}</b>/{h.to.qty}{h.to.unit}</span></li>
              ))}
            </ul>
          </Accordion>
        )}
        {ing && usedIn > 0 && <p className="text-xs text-muted">{usedIn}件のレシピで使っています。値段を変えると、その原価も自動で計算し直します。</p>}
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !d.name.trim()} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "保存する"}</button>
        {ing && <button onClick={remove} className={`w-full ${ui.quiet} text-ng`}>この材料を消す</button>}
      </div>
    </Sheet>
  );
}
