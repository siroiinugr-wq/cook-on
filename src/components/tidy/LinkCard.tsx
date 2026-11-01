// はじめに：お店の材料を共有の材料（はじめの材料・食品成分表など）に結ぶ。
// 名前が同じ・覚えた別名のものはその場で結び、迷うものは候補を出して人が選ぶ。「AIで探す」はAIが候補から選ぶ（クレジット）。
// 結ぶと、アレルゲンの候補・成分・参考価格が使えるようになる。仕入れ値が空なら参考価格が入る（「参考価格」の印付き）
import { useState } from "react";
import { AI_MATCH_BATCH, CREDIT_COST } from "@shared/credits";
import { call, newRequestId } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";

interface Suggestion {
  ingredientId: string;
  name: string;
  pick: { id: string; name: string; confidence: number; via: string } | null;
  candidates: { id: string; name: string }[];
  current?: string;
}
interface RelinkResult { linked: number; priced: number; checked: number; globals: number; suggestions: Suggestion[]; aiUsed: number }

export function LinkCard({ orgId, loose, credits }: { orgId: string; loose: number; credits: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const run = useCreditAction(credits);
  const aiCost = Math.max(1, Math.ceil(loose / AI_MATCH_BATCH)) * CREDIT_COST.aiMatch;

  async function relink(useAi: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const exec = () => call<RelinkResult>("relinkIngredients", { orgId, useAi, requestId: newRequestId() });
      const r = useAi
        ? await run({ title: "共有の材料をAIで探す", credits: aiCost, detail: "名前で決まらなかった材料だけをAIが探します（実際に使った分だけ引きます）。", exec })
        : await exec();
      if (!r) return;
      if (r.globals === 0) {
        setMsg("共有の材料がまだ入っていません（運営の準備待ちです）。");
        return;
      }
      setList(r.suggestions);
      setChosen(Object.fromEntries(r.suggestions.flatMap((s) => (s.pick && (s.pick.via === "ai" ? s.pick.confidence >= 0.6 : s.pick.confidence >= 0.85) ? [[s.ingredientId, s.pick.id]] : []))));
      setMsg([
        r.linked ? `${r.linked}件を名前で結びました。` : "",
        r.priced ? `${r.priced}件の空の仕入れ値に参考価格を入れました。` : "",
        r.suggestions.length ? `下の${r.suggestions.length}件は候補を確かめてから結んでください。` : "",
        !r.linked && !r.priced && !r.suggestions.length ? "新しく結べる材料はありませんでした。" : "",
      ].join(""));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAll() {
    const links = Object.entries(chosen).filter(([, g]) => g).map(([ingredientId, globalId]) => ({ ingredientId, globalId }));
    if (!links.length) return;
    setBusy(true);
    try {
      const r = await call<{ linked: number; priced: number }>("confirmLinks", { orgId, links });
      setMsg(`${r.linked}件を結びました${r.priced ? `（${r.priced}件に参考価格を入れました）` : ""}。次からはこの名前も同じ材料として結ばれます。`);
      setList((cur) => cur?.filter((s) => !chosen[s.ingredientId]) ?? null);
      setChosen({});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const picked = Object.values(chosen).filter(Boolean).length;
  return (
    <section className={`${ui.card} space-y-2`}>
      <p className="font-bold">はじめに：材料を共有の材料に結ぶ</p>
      <p className="text-sm text-ink-soft">
        共有の材料（食品成分表など）に結ぶと、アレルゲンの候補・成分・参考価格が使えます。仕入れ値が空の材料には参考価格が入ります（「参考価格」と表示）。
        {loose > 0 && ` 結びついていない材料：${loose}件`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => relink(false)} className={ui.secondary}>{busy ? "探しています…" : "名前で結ぶ（無料）"}</button>
        <button disabled={busy || loose === 0} onClick={() => relink(true)} className={ui.secondary}>AIで探す<CostTag credits={aiCost} /></button>
      </div>
      <p className="text-xs text-muted">バターと発酵バターのように迷うものは、AIでも人が選んでから結びます。</p>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      {list && list.length > 0 && (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((s) => (
              <li key={s.ingredientId} className="space-y-1 px-3 py-2">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  {s.current ? <span className="shrink-0 text-xs text-warn-strong">結び先の見直し</span>
                    : s.pick && <span className="shrink-0 text-xs text-muted">{s.pick.via === "ai" ? "AI" : "似た名前"}・自信 {Math.round(s.pick.confidence * 100)}%</span>}
                </div>
                {s.current && <p className="text-xs text-muted">今は「{s.current}」に結びついています。別の材料なら結び直してください。</p>}
                <select className={`${ui.input} py-1.5 text-sm`} value={chosen[s.ingredientId] ?? ""} onChange={(e) => setChosen({ ...chosen, [s.ingredientId]: e.target.value })}>
                  <option value="">{s.current ? "今のまま" : "結ばない（どれも違う）"}</option>
                  {[...(s.pick && !s.candidates.some((c) => c.id === s.pick!.id) ? [{ id: s.pick.id, name: s.pick.name }] : []), ...s.candidates].map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{s.pick?.id === c.id ? "（おすすめ）" : ""}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <button disabled={busy || !picked} onClick={confirmAll} className={`w-full ${ui.primary}`}>{busy ? "結んでいます…" : `選んだ${picked}件を結ぶ`}</button>
        </>
      )}
    </section>
  );
}
