// AIに相談：原価を下げる案／この材料で作れる新しい商品の案。案を出すだけで、レシピは書き換えない（決めるのは人）
import { useState } from "react";
import { CREDIT_COST, SUGGEST_MAX_CHARS } from "@shared/credits";
import { yen } from "@shared/cost";
import { call, newRequestId } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";

interface Idea { title: string; change: string; effect: string; costDiffYen?: number | null; caution?: string }
const MODES = [{ id: "costDown", label: "原価を下げたい" }, { id: "newRecipe", label: "新しい商品を考えたい" }] as const;

export function AiSuggest({ orgId, recipeId, credits }: { orgId: string; recipeId: string; credits: number }) {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("costDown");
  const [question, setQuestion] = useState("");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = useCreditAction(credits);
  const cost = CREDIT_COST.aiSuggest;

  async function ask() {
    setErr("");
    setBusy(true);
    try {
      const r = await run({
        title: "AIに相談する", credits: cost,
        exec: () => call<{ ideas: Idea[] }>("aiSuggest", { orgId, recipeId, mode, question, requestId: newRequestId() }),
      });
      if (r) setIdeas(r.ideas);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className={`flex-1 rounded-xl border px-2 py-2 text-sm ${mode === m.id ? "border-clay bg-clay-soft font-bold text-clay-strong" : "border-line text-ink-soft"}`}>{m.label}</button>
        ))}
      </div>
      <textarea className={`${ui.input} h-20`} maxLength={SUGGEST_MAX_CHARS} value={question} onChange={(e) => setQuestion(e.target.value)}
        placeholder={mode === "costDown" ? "例：食感は変えたくない／バターは減らしたくない" : "例：夏向けの冷たいお菓子にしたい"} />
      <button onClick={ask} disabled={busy} className={`w-full ${ui.primary}`}>
        {busy ? "考えています…" : "相談する"}<CostTag credits={cost} />
      </button>
      {err && <p className="text-sm text-ng">{err}</p>}
      {ideas && (
        <div className="space-y-2">
          {!ideas.length && <p className="text-sm text-muted">案が出ませんでした。相談の文を変えて試してください。</p>}
          {ideas.map((x, i) => (
            <div key={i} className="space-y-1 rounded-xl border border-line p-3 text-sm">
              <p className="font-bold">{x.title}{typeof x.costDiffYen === "number" && <span className={`ml-2 text-xs ${x.costDiffYen < 0 ? "text-ok-strong" : "text-muted"}`}>1ロット {x.costDiffYen > 0 ? "+" : "−"}{yen(Math.abs(x.costDiffYen))}</span>}</p>
              <p>{x.change}</p>
              <p className="text-ink-soft">{x.effect}</p>
              {x.caution && <p className="text-xs text-warn-strong">注意：{x.caution}</p>}
            </div>
          ))}
          <p className="text-[11px] text-muted">案は目安です。味・食感・ラベルの表示は、必ず試作して確かめてください。</p>
        </div>
      )}
    </div>
  );
}
