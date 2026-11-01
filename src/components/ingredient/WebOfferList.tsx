// ネットで値段を比べる：AIが Google 検索で売り場を探し、100gあたりの安い順に並べる（1回1クレジット）。
// 今の仕入れ値（レシートで入れた値段）と比べ、気に入った売り場を「仕入れ候補」に選べる。仕入れ値に入れるのは「この値段にする」を押したときだけ
import { useState } from "react";
import { CREDIT_COST } from "@shared/credits";
import { yen } from "@shared/cost";
import { rankOffers, type WebOffer, type WebOffers } from "@shared/offers";
import type { Ingredient } from "@shared/types";
import { useOrgCtx } from "../../contexts/OrgContext";
import { call, newRequestId, saveDoc } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { WebSources } from "../common/WebSources";
import { ui } from "../common/ui";

export function WebOfferList({ ing, onUse }: { ing: Ingredient; onUse: (o: WebOffer) => void }) {
  const { orgId, org } = useOrgCtx();
  const run = useCreditAction(org.credits);
  const [offers, setOffers] = useState<WebOffers | null>(ing.offers ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function search() {
    setBusy(true);
    setErr("");
    try {
      const r = await run({
        title: "ネットで値段を比べる", credits: CREDIT_COST.priceCompare,
        detail: `「${ing.name}」を売っているお店をAIが Google 検索で探し、100gあたりの安い順に並べます。見つからなかったときは使われません。`,
        exec: () => call<{ offers: WebOffers }>("compareWebPrices", { orgId, ingredientId: ing.id, requestId: newRequestId() }),
      });
      if (r) setOffers(r.offers);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pick(index: number) {
    if (!offers) return;
    const next = { ...offers, picked: offers.picked === index ? null : index };
    setOffers(next);
    await saveDoc(`organizations/${orgId}/ingredients/${ing.id}`, { offers: next }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  const ranked = offers ? rankOffers(offers.list, ing) : [];
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">ネットの値段と比べる</p>
        {offers && <span className="text-[11px] text-muted">{offers.at.slice(0, 10)} に調べた</span>}
      </div>
      {ranked.length > 0 && (
        <ul className="space-y-1.5">
          {ranked.map((o, k) => {
            const picked = offers?.picked === o.index;
            return (
              <li key={o.index} className={`rounded-lg p-2 text-sm ${picked ? "bg-clay-soft" : "bg-sand"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-medium">{k === 0 && o.per100 !== null && <span className="mr-1 rounded bg-ok px-1 text-[11px] text-white">いちばん安い</span>}{o.shop}</span>
                  <span className="shrink-0 font-bold">{o.per100 !== null ? `${yen(o.per100)}/100g` : "—"}</span>
                </div>
                <p className="text-xs text-ink-soft">{o.product}・税込 {yen(o.price)}／{o.qty}{o.unit}{o.note ? `・${o.note}` : ""}</p>
                {o.diff !== null && o.diff !== 0 && <p className={`text-xs ${o.diff < 0 ? "text-ok" : "text-ng"}`}>今の仕入れ値より{o.diff < 0 ? `${-o.diff}%安い` : `${o.diff}%高い`}（税抜で比べています）</p>}
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  {o.url && <a href={o.url} target="_blank" rel="noreferrer" className="text-clay-strong underline">売り場を見る</a>}
                  <button type="button" onClick={() => pick(o.index)} className="underline">{picked ? "★ 仕入れ候補（外す）" : "☆ 仕入れ候補にする"}</button>
                  <button type="button" onClick={() => onUse(o)} className="underline">この値段を仕入れ値にする</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {offers && <p className="text-[11px] text-muted">AIが見つけた範囲の目安です。送料・まとめ買いの条件・今の値段は、売り場のページで確かめてください。</p>}
      {offers && <WebSources searchHtml={offers.searchHtml} />}
      {err && <p className="text-xs text-ng">{err}</p>}
      <button type="button" disabled={busy} onClick={search} className={`w-full ${ui.secondary} text-sm`}>
        {busy ? "探しています…" : offers ? "もう一度調べる" : "売っているお店と値段をAIが探す"}{!busy && <CostTag credits={CREDIT_COST.priceCompare} />}
      </button>
    </div>
  );
}
