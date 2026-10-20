// 包装セットを作る・直す（例：10cm袋1枚＋脱酸素剤30 1個＋シール1枚）。レシピにはセットごと「1個あたり」で付ける
import { useState } from "react";
import { yen } from "@shared/cost";
import { PACK_LIMITS, packUnitCost, setCost } from "@shared/packaging";
import type { PackagingMaterial, PackagingSet, PackSetItem } from "@shared/types";
import { newId, removeDoc, saveDoc } from "../../lib/store";
import { useConfirm } from "../common/ConfirmDialog";
import { Icon } from "../common/Icon";
import { Sheet } from "../common/Sheet";
import { ui } from "../common/ui";

interface Props {
  orgId: string;
  uid: string;
  set: PackagingSet | null;
  materials: PackagingMaterial[];
  usedIn: number;
  onClose: () => void;
}

export function PackSetSheet({ orgId, uid, set, materials, usedIn, onClose }: Props) {
  const [name, setName] = useState(set?.name ?? "");
  const [items, setItems] = useState<PackSetItem[]>(set?.items ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  const matById = new Map(materials.map((m) => [m.id, m]));
  const total = setCost({ items }, matById);
  const left = materials.filter((m) => !items.some((it) => it.packagingId === m.id));

  const patch = (i: number, p: Partial<PackSetItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const add = (id: string) => {
    const m = matById.get(id);
    if (m) setItems([...items, { packagingId: m.id, name: m.name, qty: 1 }]);
  };

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const path = `organizations/${orgId}/packagingSets`;
      // 資材の名前は今の名前で写しておく（資材を消しても、セットの中に何があったか読めるように）
      const clean = items.filter((it) => it.qty > 0).map((it) => ({ ...it, name: matById.get(it.packagingId)?.name ?? it.name }));
      const data = { name: name.trim(), items: clean };
      if (set) await saveDoc(`${path}/${set.id}`, data);
      else await saveDoc(`${path}/${newId(path)}`, { ...data, createdBy: uid }, { merge: false });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした。");
      setBusy(false);
    }
  }

  async function remove() {
    if (!set) return;
    const ok = await confirm({ title: `「${set.name}」を消しますか？`, body: usedIn ? `${usedIn}件のレシピで使っています。消すと、その包装は原価に入らなくなります。` : "資材は消えません。", ok: "消す" });
    if (!ok) return;
    await removeDoc(`organizations/${orgId}/packagingSets/${set.id}`);
    onClose();
  }

  return (
    <Sheet title={set ? "包装セットを直す" : "包装セットを作る"} onClose={onClose}>
      <div className="space-y-4">
        <label className="block space-y-1"><span className={ui.label}>セットの名前</span>
          <input className={ui.input} value={name} maxLength={60} placeholder="焼き菓子の個包装（10cm袋）" onChange={(e) => setName(e.target.value)} /></label>
        <div className="space-y-1.5">
          <p className={ui.label}>中身（1セットに使う数）</p>
          {items.map((it, i) => {
            const m = matById.get(it.packagingId);
            const unit = m ? packUnitCost(m) : null;
            return (
              <div key={it.packagingId} className="flex items-center gap-1.5 rounded-xl border border-line bg-paper p-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{m?.name ?? `${it.name}（消した資材）`}</span>
                <input className="w-14 rounded-lg border border-line-strong px-2 py-1 text-right" inputMode="decimal" value={it.qty}
                  onChange={(e) => patch(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                <span className="w-6 text-xs text-muted">{m?.unit ?? ""}</span>
                <span className="w-16 text-right text-xs">{unit === null ? <span className="text-warn-strong">値段なし</span> : yen(unit * it.qty)}</span>
                <button className="px-1 text-faint" aria-label="外す" onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
            );
          })}
          {items.length < PACK_LIMITS.setItems && (left.length ? (
            <select className={ui.input} value="" onChange={(e) => add(e.target.value)}>
              <option value="">＋ 資材を足す</option>
              {left.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : <p className="text-xs text-muted">{materials.length ? "登録した資材はすべて入っています。" : "先に包装資材を登録してください。"}</p>)}
        </div>
        <p className="rounded-xl bg-sand p-3 text-sm">
          1セット <b className="text-lg">{yen(total.cost)}</b>（税抜）
          {total.missing > 0 && <span className="block text-xs text-warn-strong">値段の入っていない資材が{total.missing}つあります。その分は入っていません。</span>}
        </p>
        {set && usedIn > 0 && <p className="text-xs text-muted">{usedIn}件のレシピで使っています。中身を変えると、そのレシピの原価も自動で計算し直します。</p>}
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !name.trim() || !items.length} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "保存する"}</button>
        {set && <button onClick={remove} className={`w-full ${ui.quiet} text-ng`}>このセットを消す</button>}
      </div>
    </Sheet>
  );
}
