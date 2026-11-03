// gに直せない材料：仕入れ値はあるのに「1個」「1本」「1袋」で買っていて重さが分からず、1gあたりの値段が出ない材料（レシートから入れたものに多い）。
// 1つの重さを入れると原価に入る。目安（shared/units.ts の typicalPieceGrams）を初めから入れ、分からないものはAIがネットで調べる（searchPackSizes）
import { useEffect, useState } from "react";
import { fromExTax, yen } from "@shared/cost";
import { sizeSearchCredits, SIZE_SEARCH_MAX } from "@shared/credits";
import type { Ingredient } from "@shared/types";
import { toGrams, typicalPieceGrams, type Unit } from "@shared/units";
import { useOrgCtx } from "../../contexts/OrgContext";
import { call, newRequestId, saveDoc } from "../../lib/store";
import { numText } from "../../lib/num";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";

const PAGE = 30;
type Found = { found: boolean; qty: number; unit: Unit; gramsPerPiece: number | null; sizeNote: string };

/** ネットで調べた包装の量を「1つの重さ g」にする（1kg → 1000、500ml → 500×1ml の重さ） */
function gramsOfPack(f: Found, ing: Pick<Ingredient, "gramsPerMl">): number | null {
  if (!f.found) return null;
  if (f.gramsPerPiece && f.gramsPerPiece > 0) return f.gramsPerPiece;
  const g = toGrams(f.qty, f.unit, { gramsPerMl: ing.gramsPerMl });
  return g && g > 0 ? Math.round(g) : null;
}

export function GramsFix({ orgId, list, usedIn }: { orgId: string; list: Ingredient[]; usedIn: Map<string, number> }) {
  const page = list.slice(0, PAGE);
  const { org } = useOrgCtx();
  const run = useCreditAction(org.credits);
  const [vals, setVals] = useState<Record<string, { g: string; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 目安の重さを初めから入れておく
  useEffect(() => {
    setVals((cur) => {
      const next = { ...cur };
      for (const i of page) {
        if (next[i.id]) continue;
        const t = typicalPieceGrams(i.name);
        next[i.id] = { g: t ? String(t) : "", note: t ? "目安" : "" };
      }
      return next;
    });
  }, [page]);

  if (!list.length) return <p className="text-sm text-muted">すべての材料が g で計算できます。</p>;
  const unknown = page.filter((i) => !vals[i.id]?.g || vals[i.id]?.note === "目安").slice(0, SIZE_SEARCH_MAX);

  async function searchWeb() {
    setBusy(true);
    setMsg("");
    try {
      const r = await run({
        title: "包装の量をネットで調べる", credits: sizeSearchCredits(unknown.length),
        detail: `${unknown.length}品の1つあたりの量を、AIがネットで調べます（ほかのお店で調べ済みの品は無料）。`,
        exec: () => call<{ results: Found[] }>("searchPackSizes", {
          orgId, requestId: newRequestId(),
          lines: unknown.map((i) => ({ name: (i.aliases?.at(-1) ?? i.name).slice(0, 80), generic: i.name.slice(0, 40), price: fromExTax(i.purchasePrice ?? 0, i.priceTax ?? 0) / Math.max(1, i.purchaseQty), tax: i.priceTax ?? 0.08, clue: `1${i.purchaseUnit}あたりの値段` })),
        }),
      });
      if (!r) return;
      let hit = 0;
      setVals((cur) => {
        const next = { ...cur };
        r.results.forEach((f, k) => {
          const g = gramsOfPack(f, unknown[k]);
          if (g) { hit++; next[unknown[k].id] = { g: String(g), note: f.sizeNote ? `ネット：${f.sizeNote}` : "ネットで調べた量" }; }
        });
        return next;
      });
      setMsg(`${unknown.length}品のうち${hit}品の量が分かりました。確かめて「確定」を押してください。`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg("");
    let done = 0;
    try {
      for (const i of page) {
        const g = Number(numText(vals[i.id]?.g ?? ""));
        if (!(g > 0)) continue;
        await saveDoc(`organizations/${orgId}/ingredients/${i.id}`, { gramsPerPiece: Math.round(g * 10) / 10 });
        done++;
      }
      setMsg(`${done}件の重さを入れました。使っているレシピの原価を計算し直します。`);
    } catch {
      setMsg(`${done}件まで保存しました。もう一度お試しください。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">レシートから「1個」「1本」「1袋」で入った材料は、1つの重さが分からないと1gあたりの値段が出ません。袋の表示の内容量（牛乳1本＝約1030g、砂糖1袋＝1000gなど）を入れてください。黄色は目安です。</p>
      <ul className="divide-y divide-line">
        {page.map((i) => {
          const v = vals[i.id] ?? { g: "", note: "" };
          return (
            <li key={i.id} className="space-y-1 py-2">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                <span className="shrink-0 text-xs text-muted">レシピ{usedIn.get(i.id) ?? 0}件</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="shrink-0 text-muted">{yen(i.purchasePrice)}で{i.purchaseQty}{i.purchaseUnit}／1{i.purchaseUnit} ＝</span>
                <input className={`${ui.input} w-24 ${v.note === "目安" ? "bg-warn-soft" : ""}`} inputMode="decimal" placeholder="g" value={v.g}
                  onChange={(e) => setVals((c) => ({ ...c, [i.id]: { g: e.target.value, note: "" } }))} />
                <span className="shrink-0">g</span>
              </div>
              {v.note && <p className="text-xs text-warn-strong">{v.note}</p>}
            </li>
          );
        })}
      </ul>
      {unknown.length > 0 && (
        <button disabled={busy} onClick={searchWeb} className={`w-full ${ui.secondary}`}>
          {busy ? "調べています…" : `重さが分からない${unknown.length}品をAIがネットで調べる`}{!busy && <CostTag credits={sizeSearchCredits(unknown.length)} />}
        </button>
      )}
      <button disabled={busy} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "入れた重さで確定する"}</button>
      {list.length > PAGE && <p className="text-center text-xs text-muted">残り{list.length - PAGE}件は、確定すると次に出ます。</p>}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
