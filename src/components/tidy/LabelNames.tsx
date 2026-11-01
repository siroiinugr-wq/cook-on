// ラベル（品質表示）の名前：お店の呼び方（キビ糖・発酵バター）を、一括表示の一般的な名前（きび砂糖・バター）に直す。
// AIが案を出し（20件で1クレジット）、人が一覧で直してまとめて確定する。AIを使わず手で入れてもよい
import { useMemo, useState } from "react";
import { labelNameCredits, LABEL_NAME_MAX } from "@shared/credits";
import type { Ingredient } from "@shared/types";
import { call, newRequestId, saveDoc } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";

interface Suggestion { ingredientId: string; label: string; additive: boolean; confidence: number }
type Row = { label: string; additive: boolean; low?: boolean };

export function LabelNames({ orgId, list, usedIn, credits }: { orgId: string; list: Ingredient[]; usedIn: Map<string, number>; credits: number }) {
  const [all, setAll] = useState(false);
  const targets = useMemo(() => (all ? list : list.filter((i) => !i.labelName?.trim())).slice(0, LABEL_NAME_MAX), [list, all]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = useCreditAction(credits);
  const cost = labelNameCredits(targets.length);

  async function suggest() {
    setBusy(true);
    setMsg("");
    try {
      const r = await run({
        title: `ラベルの名前の案を${targets.length}件作る`, credits: cost,
        exec: () => call<{ suggestions: Suggestion[] }>("suggestLabelNames", { orgId, ingredientIds: targets.map((i) => i.id), requestId: newRequestId() }),
      });
      if (r) {
        setRows((cur) => ({ ...cur, ...Object.fromEntries(r.suggestions.map((s) => [s.ingredientId, { label: s.label, additive: s.additive, low: s.confidence < 0.6 }])) }));
        setMsg(`${r.suggestions.length}件の案を入れました。直してから「確定」を押してください。`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const value = (i: Ingredient): Row => rows[i.id] ?? { label: i.labelName ?? "", additive: !!i.isAdditive };
  const changed = targets.filter((i) => {
    const v = value(i);
    return v.label.trim() && (v.label.trim() !== (i.labelName ?? "") || v.additive !== !!i.isAdditive);
  });

  async function confirmAll() {
    setBusy(true);
    setMsg("");
    try {
      for (const i of changed) {
        const v = value(i);
        await saveDoc(`organizations/${orgId}/ingredients/${i.id}`, { labelName: v.label.trim().slice(0, 300), isAdditive: v.additive });
      }
      setMsg(`${changed.length}件を確定しました。ラベルの原材料名に使われます。`);
      setRows({});
    } catch {
      setMsg("保存できなかった材料があります。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        ラベルの「原材料名」には、お店の呼び方ではなく一般的な名前を書きます（薄力粉→小麦粉、全卵→鶏卵、発酵バター→バター）。
        添加物（ベーキングパウダーなど）は「／」のあとに用途名で書きます。
      </p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-clay" checked={all} onChange={(e) => setAll(e.target.checked)} />名前を入れ済みの材料も出す</label>
      {!targets.length ? <p className="text-sm text-muted">すべての材料にラベルの名前が入っています。</p> : (
        <>
          <button disabled={busy} onClick={suggest} className={`w-full ${ui.secondary}`}>
            {busy ? "考えています…" : `AIで${targets.length}件の案を出す`}<CostTag credits={cost} />
          </button>
          <ul className="divide-y divide-line">
            {targets.map((i) => {
              const v = value(i);
              const set = (p: Partial<Row>) => setRows({ ...rows, [i.id]: { ...v, ...p, low: false } });
              return (
                <li key={i.id} className="space-y-1 py-2">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{i.name}{i.aliases?.length ? <span className="ml-1 text-xs text-faint">（{i.aliases.slice(0, 3).join("・")}）</span> : null}</span>
                    <span className="shrink-0 text-xs text-muted">レシピ{usedIn.get(i.id) ?? 0}件</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-faint">→</span>
                    <input className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm ${v.low ? "border-warn bg-warn-soft" : "border-line-strong"}`} value={v.label}
                      placeholder="ラベルに出す名前" onChange={(e) => set({ label: e.target.value })} />
                    <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" className="accent-clay" checked={v.additive} onChange={(e) => set({ additive: e.target.checked })} />添加物</label>
                  </div>
                  {v.low && <p className="text-[11px] text-warn-strong">AIの自信が低い案です。袋の表示を見て確かめてください。</p>}
                </li>
              );
            })}
          </ul>
          <button disabled={busy || !changed.length} onClick={confirmAll} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : `入れた${changed.length}件を確定する`}</button>
        </>
      )}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
