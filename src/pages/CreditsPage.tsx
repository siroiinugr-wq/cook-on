// クレジット：残り・何に何クレジット使うか・使った記録（通帳）・まとめ買い（決済をつなぐまでは準備中）
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ACTION_LABEL, CREDIT_COST, CREDIT_PACKS, type CreditAction } from "@shared/credits";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { call, toDate } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { Icon } from "../components/common/Icon";
import { creditText } from "../components/common/CreditBadge";
import { ui } from "../components/common/ui";
import { CREDIT_PER } from "../lib/creditPer";

interface Entry { kind: string; action?: CreditAction; amount: number; status: string; refunded?: number; createdAt: unknown }


export function CreditsPage() {
  const { orgId, org, isAdmin } = useOrgCtx();
  const { list } = useCol<Entry>(`organizations/${orgId}/creditLedger`, { orderBy: ["createdAt", "desc"], limit: 50 });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  // 決済ページから戻ってきたとき。クレジットが入るのは Stripe からの知らせが届いたあと（ふつう数秒。コンビニ払いは支払い後）
  const paid = useSearchParams()[0].get("paid") === "1";

  async function buy(packId: string) {
    setMsg("");
    setBusy(packId);
    try {
      const r = await call<{ url: string }>("createCheckout", { orgId, packId });
      window.location.href = r.url;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <PageHead title="クレジット" back="/settings" />
      {paid && <p className="rounded-xl bg-sand p-3 text-sm">お支払いありがとうございます。クレジットは数秒で「残り」に入ります（コンビニ・銀行振込は、お支払いのあとに入ります）。</p>}
      <section className={`${ui.card} text-center`}>
        <p className="text-sm text-muted">残り</p>
        <p className="font-serif text-4xl"><span className="text-clay"><Icon name="coin" className="mr-1 inline h-8 w-8" /></span>{creditText(org.credits)}</p>
        <p className="mt-1 text-xs text-muted">レシピ・材料・ラベルなどの基本の機能は、クレジットを使わずにずっと無料です。</p>
      </section>

      <section className={`${ui.card} space-y-2`}>
        <h2 className="text-sm font-bold">クレジットを使う機能</h2>
        <ul className="divide-y divide-line text-sm">
          {(Object.keys(CREDIT_COST) as CreditAction[]).map((a) => (
            <li key={a} className="flex items-center justify-between py-2"><span>{ACTION_LABEL[a]}<span className="ml-1 text-xs text-muted">（{CREDIT_PER[a]}）</span></span><b>{CREDIT_COST[a]}</b></li>
          ))}
        </ul>
        <p className="text-xs text-muted">うまくいかなかったときは、クレジットは使われません（自動で戻ります）。</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">まとめて買う</h2>
        <div className="grid grid-cols-3 gap-2">
          {CREDIT_PACKS.map((p) => (
            <button key={p.id} disabled={!isAdmin || !!busy} onClick={() => buy(p.id)} className={`${ui.card} text-center disabled:opacity-60`}>
              <p className="text-lg font-bold">{p.credits.toLocaleString()}</p>
              <p className="text-xs text-muted">クレジット</p>
              <p className="mt-1 text-sm">{busy === p.id ? "移動しています…" : `${p.priceYen.toLocaleString()}円`}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">値段は税込です。押すと決済ページ（Stripe）へ移ります。</p>
        {!isAdmin && <p className="text-xs text-muted">購入はオーナーか管理者ができます。</p>}
        {msg && <p className="rounded-xl bg-sand p-3 text-sm">{msg}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">使った記録</h2>
        {!list.length ? <p className="text-sm text-muted">まだありません。</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-paper text-sm">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{ACTION_LABEL[(e.action ?? e.kind) as keyof typeof ACTION_LABEL] ?? e.kind}</span>
                  <span className="text-xs text-muted">{toDate(e.createdAt)?.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {e.status === "refunded" ? "・うまくいかなかったので戻しました" : e.status === "held" ? "・処理中" : ""}</span>
                </span>
                <b className={e.amount > 0 ? "text-ok-strong" : e.amount < 0 ? "" : "text-muted"}>{e.amount > 0 ? `+${e.amount}` : e.amount}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
