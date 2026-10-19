// 材料の行の編集。行ごとに「お店の材料」と結びつくと原価とアレルゲンが出る。
// まとめて探す（無料）→ 残ったものだけ AI で探す（クレジット）、の順に案内する
import { useState } from "react";
import { aiMatchCredits, AI_MATCH_BATCH } from "@shared/credits";
import type { ItemMatch } from "@shared/importTypes";
import { toMatchKey } from "@shared/matchKey";
import type { Ingredient, RecipeItem } from "@shared/types";
import { UNITS, type Unit } from "@shared/units";
import { linkIngredient } from "../../../lib/ingredientLink";
import { call, newRequestId } from "../../../lib/store";
import { CostTag } from "../../common/CreditBadge";
import { Icon } from "../../common/Icon";
import { useCreditAction } from "../../common/useCreditAction";
import { ui } from "../../common/ui";
import { IngredientPicker } from "./IngredientPicker";

export type Row = RecipeItem & { _k: string };
export const rowKey = () => Math.random().toString(36).slice(2, 10);

interface Props {
  rows: Row[];
  set: (f: (rows: Row[]) => Row[]) => void;
  own: Ingredient[];
  orgId: string;
  uid: string;
  credits: number;
}

export function ItemsEditor({ rows, set, own, orgId, uid, credits }: Props) {
  const [picking, setPicking] = useState<Row | null>(null);
  const [hints, setHints] = useState<Record<string, { id: string; name: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = useCreditAction(credits);
  const byId = new Map(own.map((i) => [i.id, i]));
  const open = rows.filter((r) => !r.ingredientId && r.name.trim() && r.unit !== "適量");

  const patch = (k: string, p: Partial<Row>) => set((rs) => rs.map((r) => (r._k === k ? { ...r, ...p } : r)));
  const rename = (k: string, name: string) => {
    const hit = own.find((i) => toMatchKey(i.name) === toMatchKey(name));
    patch(k, { name, ingredientId: hit?.id ?? null });
  };

  /** 名寄せの結果を行に当てる。自信があるものは結ぶ、迷うものは候補を出す */
  async function apply(targets: Row[], matches: ItemMatch[], min: number) {
    let linked = 0;
    const nextHints: typeof hints = {};
    // 同じ共有の材料が2行に出ても、お店の材料は1つだけ作る（own はまだ読み直されていないため）
    const made = new Map<string, string>();
    for (let i = 0; i < targets.length; i++) {
      const m = matches[i];
      if (m && m.kind !== "none" && m.confidence >= min) {
        const id = made.get(m.id ?? "") ?? await linkIngredient(orgId, uid, m, targets[i].name, own);
        if (m.id) made.set(m.id, id);
        patch(targets[i]._k, { ingredientId: id });
        linked++;
      } else if (m?.candidates?.length) nextHints[targets[i]._k] = m.candidates.slice(0, 3);
    }
    setHints((h) => ({ ...h, ...nextHints }));
    return linked;
  }

  async function findFree() {
    setBusy(true);
    setMsg("");
    try {
      const t = open.slice(0, AI_MATCH_BATCH);
      const r = await call<{ matches: ItemMatch[] }>("suggestIngredients", { orgId, names: t.map((x) => x.name) });
      const n = await apply(t, r.matches, 0.9);
      setMsg(n ? `${n}件を結びつけました。` : "確かな一致はありませんでした。候補から選ぶか、AIで探せます。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function findAi() {
    const t = open.slice(0, AI_MATCH_BATCH);
    setBusy(true);
    setMsg("");
    try {
      const r = await run({
        title: "材料名をAIで探す", credits: aiMatchCredits(t.length), detail: `${t.length}件の材料名を調べます。`,
        exec: () => call<{ matches: ItemMatch[] }>("aiMatchIngredients", { orgId, names: t.map((x) => x.name), requestId: newRequestId() }),
      });
      if (r) setMsg(`${await apply(t, r.matches, 0.85)}件を結びつけました。`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const ing = r.ingredientId ? byId.get(r.ingredientId) : undefined;
        return (
          <div key={r._k} className="space-y-1.5 rounded-xl border border-line bg-paper p-2.5">
            <div className="flex gap-1.5">
              <input className="min-w-0 flex-1 rounded-lg border border-line-strong px-2 py-1.5" placeholder="材料名" value={r.name} onChange={(e) => rename(r._k, e.target.value)} />
              <input className="w-16 rounded-lg border border-line-strong px-2 py-1.5 text-right" inputMode="decimal" placeholder="量" disabled={r.unit === "適量"}
                value={r.qty ?? ""} onChange={(e) => patch(r._k, { qty: e.target.value === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) })} />
              <select className="w-[4.5rem] rounded-lg border border-line-strong px-1 py-1.5" value={r.unit} onChange={(e) => patch(r._k, { unit: e.target.value as Unit, ...(e.target.value === "適量" ? { qty: null } : {}) })}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
              <button className="px-1 text-faint" aria-label="この行を消す" onClick={() => set((rs) => rs.filter((x) => x._k !== r._k))}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button onClick={() => setPicking(r)} className={`rounded-full px-2 py-0.5 ${ing ? "bg-ok-soft text-ok-strong" : "bg-warn-soft text-warn-strong"}`}>
                {ing ? `✓ ${ing.name}${ing.purchasePrice === null ? "（仕入れ値なし）" : ""}` : "材料を選ぶ"}
              </button>
              {!ing && hints[r._k]?.map((h) => (
                <button key={h.id} className="rounded-full border border-line px-2 py-0.5 text-ink-soft"
                  onClick={async () => patch(r._k, { ingredientId: await linkIngredient(orgId, uid, { kind: "global", id: h.id, name: h.name }, r.name, own) })}>
                  {h.name}？
                </button>
              ))}
              <input className="min-w-24 flex-1 bg-transparent text-muted outline-none placeholder:text-faint" placeholder="メモ（室温に戻す など）" value={r.note ?? ""} onChange={(e) => patch(r._k, { note: e.target.value })} />
            </div>
          </div>
        );
      })}
      <button className={`${ui.secondary} w-full py-2 text-sm`} onClick={() => set((rs) => [...rs, { _k: rowKey(), ingredientId: null, name: "", qty: null, unit: "g" }])}>
        ＋ 材料を足す
      </button>
      {open.length > 0 && (
        <div className="space-y-2 rounded-xl bg-sand p-3 text-sm">
          <p>まだ結びついていない材料が{open.length}件あります。結びつけると原価とアレルゲンが出ます。</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={findFree} className={`${ui.secondary} py-2 text-sm`}>まとめて探す（無料）</button>
            <button disabled={busy} onClick={findAi} className={`${ui.secondary} py-2 text-sm`}>AIで探す<CostTag credits={aiMatchCredits(Math.min(open.length, AI_MATCH_BATCH))} /></button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      {picking && (
        <IngredientPicker orgId={orgId} uid={uid} name={picking.name} own={own} onClose={() => setPicking(null)}
          onPick={(id, name) => patch(picking._k, { ingredientId: id, name: picking.name.trim() ? picking.name : name })} />
      )}
    </div>
  );
}
