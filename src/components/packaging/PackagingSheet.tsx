// 包装資材（袋・脱酸素剤・シールなど）の登録・編集。値段は「100枚で1,500円」のように入れ、1枚の値段を出す
// 値段は税抜でも税込でも入れられる（保存はいつも税抜。priceTax は次に開いたとき同じ形で出すため）
import { useState } from "react";
import { fromExTax, PRICE_TAX_OPTIONS, toExTax, yen } from "@shared/cost";
import { packUnitCost } from "@shared/packaging";
import { PACK_UNITS, type PackagingMaterial, type PackUnit } from "@shared/types";
import { newId, removeDoc, saveDoc } from "../../lib/store";
import { useConfirm } from "../common/ConfirmDialog";
import { Sheet } from "../common/Sheet";
import { ui } from "../common/ui";

export function PackagingSheet({ orgId, uid, mat, usedIn, onClose }: { orgId: string; uid: string; mat: PackagingMaterial | null; usedIn: number; onClose: () => void }) {
  const [name, setName] = useState(mat?.name ?? "");
  const [tax, setTax] = useState<number>(mat?.priceTax ?? 0.1);
  const [price, setPrice] = useState<string>(mat?.purchasePrice == null ? "" : String(fromExTax(mat.purchasePrice, mat.priceTax ?? 0)));
  const [qty, setQty] = useState(String(mat?.purchaseQty ?? 100));
  const [unit, setUnit] = useState<PackUnit>(mat?.unit ?? "枚");
  const [supplier, setSupplier] = useState(mat?.supplier ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.]/g, "")));
  const exTax = num(price) === null ? null : toExTax(num(price)!, tax);
  const per = packUnitCost({ purchasePrice: exTax, purchaseQty: num(qty) ?? 0 });

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const path = `organizations/${orgId}/packaging`;
      const data = { name: name.trim(), purchasePrice: exTax, purchaseQty: num(qty) || 1, unit, priceTax: tax, supplier: supplier.trim() };
      if (mat) await saveDoc(`${path}/${mat.id}`, data);
      else await saveDoc(`${path}/${newId(path)}`, { ...data, createdBy: uid }, { merge: false });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした。");
      setBusy(false);
    }
  }

  async function remove() {
    if (!mat) return;
    const ok = await confirm({ title: `「${mat.name}」を消しますか？`, body: usedIn ? `${usedIn}件のレシピ・セットで使っています。消すと、その分は原価に入らなくなります。` : "元に戻せません。", ok: "消す" });
    if (!ok) return;
    await removeDoc(`organizations/${orgId}/packaging/${mat.id}`);
    onClose();
  }

  return (
    <Sheet title={mat ? "包装資材を直す" : "包装資材を登録"} onClose={onClose}>
      <div className="space-y-4">
        <label className="block space-y-1"><span className={ui.label}>名前</span>
          <input className={ui.input} value={name} maxLength={60} placeholder="10cm袋、脱酸素剤30 など" onChange={(e) => setName(e.target.value)} /></label>
        <div className="space-y-1">
          <span className={ui.label}>仕入れ値</span>
          <div className="flex gap-1">
            {PRICE_TAX_OPTIONS.map((o) => (
              <button key={o.rate} type="button" onClick={() => setTax(o.rate)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${tax === o.rate ? "border-clay bg-clay-soft font-bold text-clay-strong" : "border-line text-muted"}`}>{o.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input className={`${ui.input} w-28`} inputMode="numeric" placeholder="未入力" value={price} onChange={(e) => setPrice(e.target.value)} />
            <span className="shrink-0 text-sm">円で</span>
            <input className={`${ui.input} w-20`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <select className={`${ui.input} w-20`} value={unit} onChange={(e) => setUnit(e.target.value as PackUnit)}>{PACK_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <p className="text-xs text-muted">
            {per !== null ? `1${unit}あたり 税抜 ${yen(per)}${tax ? `（税抜の仕入れ値 ${yen(exTax)}）` : ""}` : "1枚あたりの値段を出すには、仕入れ値と数を入れてください。"}
          </p>
        </div>
        <label className="block space-y-1"><span className={ui.label}>仕入れ先（任意）</span>
          <input className={ui.input} value={supplier} maxLength={60} onChange={(e) => setSupplier(e.target.value)} /></label>
        {mat && usedIn > 0 && <p className="text-xs text-muted">{usedIn}件のレシピ・セットで使っています。値段を変えると、使っているレシピの原価も自動で計算し直します。</p>}
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !name.trim()} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "保存する"}</button>
        {mat && <button onClick={remove} className={`w-full ${ui.quiet} text-ng`}>この資材を消す</button>}
      </div>
    </Sheet>
  );
}
