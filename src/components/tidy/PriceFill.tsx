// 仕入れ値の入力：仕入れ値が空の材料を、よく使う順にその場で入れる。共有の材料に参考価格があれば1押しで入る
import { Link } from "react-router-dom";
import { RefBadge } from "../ingredient/RefBadge";
import { useEffect, useState } from "react";
import { PRICE_TAX_OPTIONS, toExTax, yen } from "@shared/cost";
import { ESTAT_CREDIT, refPriceExTax } from "@shared/refPrice";
import type { GlobalIngredient, Ingredient } from "@shared/types";
import { UNITS, type Unit } from "@shared/units";
import { call, getOnce, newRequestId, saveDoc } from "../../lib/store";
import { priceSearchCredits } from "@shared/credits";
import { useOrgCtx } from "../../contexts/OrgContext";
import { CostTag } from "../common/CreditBadge";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";
import { numText } from "../../lib/num";

const PAGE = 20;
const BUY_UNITS = UNITS.filter((u) => u !== "適量");

export function PriceFill({ orgId, list, usedIn }: { orgId: string; list: Ingredient[]; usedIn: Map<string, number> }) {
  const page = list.slice(0, PAGE);
  const [refs, setRefs] = useState<Record<string, GlobalIngredient | null>>({});
  const [bulk, setBulk] = useState("");
  const { org } = useOrgCtx();
  const run = useCreditAction(org.credits);
  const [webMsg, setWebMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // 共有の材料に結びついていれば、参考価格を読む
  const keys = page.map((i) => i.globalRef ?? "").join(",");
  useEffect(() => {
    let alive = true;
    const want = [...new Set(page.map((i) => i.globalRef).filter((x): x is string => !!x && !(x in refs)))];
    Promise.all(want.map(async (id) => [id, await getOnce<GlobalIngredient>(`globalIngredients/${id}`).catch(() => null)] as const))
      .then((xs) => alive && xs.length && setRefs((r) => ({ ...r, ...Object.fromEntries(xs) })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  if (!list.length) return <p className="text-sm text-muted">すべての材料に仕入れ値が入っています。</p>;
  const emptyN = list.filter((i) => i.purchasePrice === null).length;

  // 仕入れ値が空の材料を、共有の参考価格（無料）→ 残りは Google 検索つきのAIで1品ずつ（出典つき）入れる
  async function fillFromWeb() {
    setBusy(true);
    setWebMsg("");
    try {
      const r = await run({
        title: "仕入れ値をネットで調べて入れる", credits: priceSearchCredits(emptyN),
        detail: `仕入れ値が空の材料（${emptyN}件）に、共有の参考価格があれば入れ（無料）、無いものはAIが Google 検索でネットの販売価格を調べて目安を入れます（1回20件まで）。どれも「参考価格」と出し、お店の仕入れ値に直すと消えます。参考価格で入った分と、調べられなかった分のクレジットは戻ります。`,
        exec: () => call<{ free: number; filled: number; tried: number; left: number }>("fillPricesFromWeb", { orgId, requestId: newRequestId() }),
      });
      if (!r) return;
      setWebMsg(`${r.free ? `共有の参考価格で${r.free}件、` : ""}ネットで調べて${r.filled}件に目安を入れました${r.tried > r.filled ? `（${r.tried - r.filled}件は見つかりませんでした）` : ""}。${r.left ? `残り${r.left}件は、もう一度押すと調べます。` : ""}`);
    } catch (e) {
      setWebMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const withRef = page.filter((i) => i.purchasePrice === null && i.globalRef && refs[i.globalRef]?.refPrice);

  async function applyAllRefs() {
    for (const i of withRef) {
      const rp = refs[i.globalRef!]!.refPrice!;
      await saveDoc(`organizations/${orgId}/ingredients/${i.id}`, { purchasePrice: refPriceExTax(rp), priceTax: 0, purchaseQty: rp.qty, purchaseUnit: rp.unit, priceSource: "ref" });
    }
    setBulk(`${withRef.length}件に参考価格（税抜）を入れました。お店の仕入れ値が分かったら直してください。`);
  }

  return (
    <div className="space-y-3">
      <Link to="/ingredients/invoices" className="block text-sm text-clay-strong underline">レシート・納品書を撮って、まとめて入れる（AI・1枚1クレジット）→</Link>
      {emptyN > 0 && (
        <div className="space-y-1">
          <button disabled={busy} onClick={fillFromWeb} className={`w-full ${ui.secondary}`}>
            {busy ? "調べています…" : `仕入れ値が空の${emptyN}件をAIがネットで調べて入れる`}{!busy && <CostTag credits={priceSearchCredits(emptyN)} />}
          </button>
          {webMsg && <p className="text-xs text-ink-soft">{webMsg}</p>}
        </div>
      )}
      <p className="text-xs text-muted">使っているレシピが多い順です。入れると、使っているレシピの原価がすぐ計算し直されます。</p>
      {withRef.length > 0 && (
        <div className="space-y-1 rounded-xl bg-sand p-3 text-sm">
          <p>{withRef.length}件に参考価格（総務省の小売物価統計・店頭の値段）があります。</p>
          <button onClick={applyAllRefs} className="text-clay-strong underline">参考価格をまとめて仕入れ値に入れる（目安）</button>
          {bulk && <p className="text-xs text-ink-soft">{bulk}</p>}
          <p className="text-[11px] text-faint">{ESTAT_CREDIT}</p>
        </div>
      )}
      <ul className="divide-y divide-line">
        {page.map((i) => <Row key={i.id} orgId={orgId} ing={i} uses={usedIn.get(i.id) ?? 0} g={i.globalRef ? refs[i.globalRef] ?? null : null} />)}
      </ul>
      {list.length > PAGE && <p className="text-center text-xs text-muted">残り{list.length - PAGE}件は、入れると次に出ます。</p>}
    </div>
  );
}

function Row({ orgId, ing, uses, g }: { orgId: string; ing: Ingredient; uses: number; g: GlobalIngredient | null }) {
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(String(ing.purchaseQty || 1));
  const [unit, setUnit] = useState<Unit>(ing.purchaseUnit || "kg");
  const [tax, setTax] = useState(0.08);
  const [busy, setBusy] = useState(false);
  const rp = g?.refPrice;

  async function save(p: { price: number; qty: number; unit: Unit; tax: number; ref?: boolean }) {
    setBusy(true);
    try {
      await saveDoc(`organizations/${orgId}/ingredients/${ing.id}`, { purchasePrice: toExTax(p.price, p.tax), priceTax: p.tax, purchaseQty: p.qty, purchaseUnit: p.unit, priceSource: p.ref ? "ref" : null });
    } finally {
      setBusy(false);
    }
  }

  const n = Number(numText(price));
  const q = Number(numText(qty));
  const input = "rounded-lg border border-line-strong bg-paper px-2 py-1.5 text-sm";
  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{ing.name}</span>
        <span className="shrink-0 text-xs text-muted">レシピ{uses}件</span>
      </div>
      {ing.priceSource === "ref" && ing.purchasePrice !== null && (
        <p className="text-xs text-muted"><RefBadge className="mr-1" />今は {yen(ing.purchasePrice)}（税抜）/{ing.purchaseQty}{ing.purchaseUnit}。お店の仕入れ値を入れると置き換わります。</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <input className={`${input} w-24`} inputMode="decimal" placeholder="値段" value={price} onChange={(e) => setPrice(e.target.value)} />
        <span className="text-sm">円で</span>
        <input className={`${input} w-16`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <select className={input} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>{BUY_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        <select className={input} value={tax} onChange={(e) => setTax(Number(e.target.value))}>{PRICE_TAX_OPTIONS.map((o) => <option key={o.rate} value={o.rate}>{o.label}</option>)}</select>
        <button disabled={busy || !(n > 0) || !(q > 0)} onClick={() => save({ price: n, qty: q, unit, tax })} className="rounded-lg bg-clay px-3 py-1.5 text-sm font-bold text-white disabled:bg-line-strong">保存</button>
      </div>
      {rp && ing.priceSource !== "ref" && (
        <button className="text-xs text-clay-strong underline" disabled={busy} onClick={() => save({ price: refPriceExTax(rp), qty: rp.qty, unit: rp.unit, tax: 0, ref: true })}>
          参考価格 {yen(rp.price)}（税込）/{rp.qty}{rp.unit}・{rp.area} を入れる
        </button>
      )}
    </li>
  );
}
