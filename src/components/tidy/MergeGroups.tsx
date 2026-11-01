// 材料の表記ゆれ：同じものらしい材料の組を出し、残す名前を選んで1つにまとめる（mergeIngredients）
import { useState } from "react";
import type { Ingredient } from "@shared/types";
import { call } from "../../lib/store";
import { useConfirm } from "../common/ConfirmDialog";

export function MergeGroups({ orgId, groups, usedIn }: { orgId: string; groups: Ingredient[][]; usedIn: Map<string, number> }) {
  if (!groups.length) return <p className="text-sm text-muted">表記ゆれは見つかりませんでした。</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        名前が似ている材料の組です。残す名前を選び、同じものだけにチェックを付けて「まとめる」。
        使っているレシピは残す材料に付け替わり（前の版は履歴に残ります）、仕入れ値が無ければ写し、アレルゲンは足し合わせます。
      </p>
      {groups.map((g) => <Group key={g.map((i) => i.id).join()} orgId={orgId} group={g} usedIn={usedIn} />)}
    </div>
  );
}

function Group({ orgId, group, usedIn }: { orgId: string; group: Ingredient[]; usedIn: Map<string, number> }) {
  const [keep, setKeep] = useState(group[0].id);
  const [on, setOn] = useState<string[]>(group.map((i) => i.id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const confirm = useConfirm();
  const drops = on.filter((id) => id !== keep);
  const name = (id: string) => group.find((i) => i.id === id)?.name ?? "";

  async function merge() {
    const ok = await confirm({
      title: `「${name(keep)}」にまとめますか？`,
      body: `${drops.map(name).join("・")} は消え、使っているレシピは「${name(keep)}」に付け替わります。`,
      ok: "まとめる",
    });
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ recipes: number }>("mergeIngredients", { orgId, keepId: keep, dropIds: drops });
      setMsg(`まとめました（レシピ${r.recipes}件を付け替え）。`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      {group.map((i) => (
        <div key={i.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-clay" checked={on.includes(i.id)} disabled={i.id === keep}
            onChange={(e) => setOn(e.target.checked ? [...on, i.id] : on.filter((x) => x !== i.id))} aria-label="まとめる" />
          <label className="flex flex-1 items-center gap-2">
            <input type="radio" name={`keep-${group[0].id}`} className="accent-clay" checked={keep === i.id} onChange={() => { setKeep(i.id); if (!on.includes(i.id)) setOn([...on, i.id]); }} />
            <span className={keep === i.id ? "font-bold" : ""}>{i.name}</span>
            <span className="text-xs text-muted">レシピ{usedIn.get(i.id) ?? 0}件{i.purchasePrice !== null ? "・値段あり" : ""}</span>
          </label>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={busy || !drops.length} onClick={merge} className="rounded-lg bg-clay px-3 py-1.5 text-sm font-bold text-white disabled:bg-line-strong">
          {busy ? "まとめています…" : drops.length ? `「${name(keep)}」に${drops.length}件をまとめる` : "まとめるものを選ぶ"}
        </button>
        <span className="text-xs text-muted">●＝残す名前、☑＝まとめる</span>
      </div>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
