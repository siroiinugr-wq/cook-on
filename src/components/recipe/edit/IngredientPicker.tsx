// 材料行を「店舗の材料」に結びつけるシート。店舗の材料 → 共有の材料（無料で探せる）→ 新しく登録、の順に出す
import { useMemo, useState } from "react";
import type { ItemMatch } from "@shared/importTypes";
import { buildIndex, rankCandidates } from "@shared/matchKey";
import type { Ingredient } from "@shared/types";
import { createIngredient, linkIngredient } from "../../../lib/ingredientLink";
import { call } from "../../../lib/store";
import { Sheet } from "../../common/Sheet";
import { ui } from "../../common/ui";

interface Props {
  orgId: string;
  uid: string;
  name: string;
  own: Ingredient[];
  onPick: (ingredientId: string, name: string) => void;
  onClose: () => void;
}

export function IngredientPicker({ orgId, uid, name, own, onPick, onClose }: Props) {
  const [q, setQ] = useState(name);
  const [globals, setGlobals] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const index = useMemo(() => buildIndex(own.map((i) => ({ id: i.id, name: i.name, aliases: i.labelName ? [i.labelName] : [] }))), [own]);
  const mine = q.trim() ? rankCandidates(q, index, 8) : own.slice(0, 30).map((i) => ({ id: i.id, name: i.name, score: 0 }));

  async function searchGlobal() {
    setBusy(true);
    setErr("");
    try {
      const r = await call<{ matches: ItemMatch[] }>("suggestIngredients", { orgId, names: [q.trim()] });
      const m = r.matches[0];
      const list = [...(m?.kind === "global" && m.id ? [{ id: m.id, name: m.name ?? "" }] : []), ...(m?.candidates ?? [])];
      setGlobals(list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pick(run: () => Promise<string>, label: string) {
    setBusy(true);
    setErr("");
    try {
      onPick(await run(), label);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const btn = "w-full rounded-xl border border-line px-3 py-2.5 text-left text-sm disabled:opacity-50";
  return (
    <Sheet title="材料を選ぶ" onClose={onClose}>
      <div className="space-y-4">
        <input className={ui.input} value={q} onChange={(e) => { setQ(e.target.value); setGlobals(null); }} placeholder="材料名" autoFocus />
        <section className="space-y-1.5">
          <p className={ui.label}>お店の材料</p>
          {!mine.length && <p className="text-sm text-muted">似た材料はありません。</p>}
          {mine.map((c) => (
            <button key={c.id} disabled={busy} className={btn} onClick={() => { onPick(c.id, c.name); onClose(); }}>{c.name}</button>
          ))}
        </section>
        <section className="space-y-1.5">
          <p className={ui.label}>共有の材料（アレルゲン付き。選ぶとお店の材料に加わります）</p>
          {globals === null ? (
            <button disabled={busy || !q.trim()} className={ui.secondary + " w-full text-sm"} onClick={searchGlobal}>{busy ? "探しています…" : "共有の材料から探す（無料）"}</button>
          ) : !globals.length ? <p className="text-sm text-muted">見つかりませんでした。</p> : globals.map((g) => (
            <button key={g.id} disabled={busy} className={btn} onClick={() => pick(() => linkIngredient(orgId, uid, { kind: "global", id: g.id, name: g.name }, q, own), g.name)}>{g.name}</button>
          ))}
        </section>
        {q.trim() && (
          <button disabled={busy} className={`w-full ${ui.primary}`} onClick={() => pick(() => createIngredient(orgId, uid, { name: q.trim() }), q.trim())}>
            「{q.trim()}」を新しい材料として登録
          </button>
        )}
        {err && <p className="text-sm text-ng">{err}</p>}
        <p className="text-xs text-muted">仕入れ値は「材料」の画面で入れると、原価に入ります。</p>
      </div>
    </Sheet>
  );
}
