// 運営：共有の材料の精査。お店の提案（呼び方・アレルゲン・仕入れ値・新しい材料）と、AIの推定価格を、1件ずつ採用・却下する。
// 採用した分だけ globalIngredients に入る（reviewSuggestion）。見られるのは operators/{uid} がある人だけ（ルールと関数の両方で確かめる）
import { useState } from "react";
import { allergenName, type AllergenId } from "@shared/allergens";
import { yen } from "@shared/cost";
import type { GlobalIngredient, GlobalSuggestion } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol, useDoc } from "../hooks/useData";
import { call } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { ui } from "../components/common/ui";

export function AdminSuggestionsPage() {
  const { uid } = useOrgCtx();
  const op = useDoc(`operators/${uid}`);
  const { list, loading } = useCol<GlobalSuggestion>(op.data ? "globalSuggestions" : null, { where: [["status", "==", "pending"]], limit: 300 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (op.loading) return <p className="py-10 text-center text-muted">読み込み中…</p>;
  if (!op.data) return <p className="py-10 text-center text-muted">運営の人だけが使える画面です。</p>;

  async function estimate() {
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ made: number; checked: number }>("estimateRefPrices", {});
      setMsg(r.checked ? `参考価格の無い共有の材料 ${r.checked}件のうち、${r.made}件にAIの推定を作りました。下で確かめてください。` : "参考価格の無い共有の材料はありません。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // お店の提案を先に、AIの推定はあとに
  const sorted = [...list].sort((a, b) => (a.source === b.source ? a.name.localeCompare(b.name, "ja") : a.source === "shop" ? -1 : 1));
  return (
    <div className="space-y-3 pb-10">
      <PageHead title="共有の材料の精査" back="/settings" />
      <p className="text-sm text-ink-soft">採用したものだけが、すべてのお店の共有の材料に入ります。お店の名前と仕入れ先は、ここ以外には出ません。</p>
      <section className={`${ui.card} space-y-2`}>
        <p className="font-bold">AIで参考価格の案を作る</p>
        <p className="text-xs text-muted">統計に無い共有の材料（はじめの材料・お店から入った材料・既製品）に、AIが相場の目安を出します。1回100件まで。運営の費用で、お店のクレジットは使いません。</p>
        <button disabled={busy} onClick={estimate} className={`w-full ${ui.secondary}`}>{busy ? "考えています…" : "AIで案を作る"}</button>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </section>
      {loading ? <p className="text-center text-muted">読み込み中…</p> : !sorted.length ? <p className="py-6 text-center text-sm text-muted">まだ確かめる提案はありません。</p> : (
        <ul className="space-y-3">{sorted.map((s) => <Card key={s.id} s={s} />)}</ul>
      )}
    </div>
  );
}

function Card({ s }: { s: GlobalSuggestion }) {
  const g = useDoc<GlobalIngredient>(s.globalId ? `globalIngredients/${s.globalId}` : null).data;
  const [name, setName] = useState(s.name);
  const [category, setCategory] = useState("お店から");
  const [aliases, setAliases] = useState(() => new Set(s.aliases));
  // アレルゲンを共有に写すのは慎重に：新しい材料は最初から、既にある材料は運営が印を付けたときだけ
  const [useAllergens, setUseAllergens] = useState(s.kind === "new");
  // 値段は、共有にまだ参考価格が無いときだけ最初から印を付ける（統計などの値段を上書きしないように）
  const [usePriceSel, setUsePrice] = useState<boolean | null>(null);
  const usePrice = usePriceSel ?? !g?.refPrice;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function decide(accept: boolean) {
    setBusy(true);
    setErr("");
    try {
      await call("reviewSuggestion", {
        id: s.id, accept, name, category, aliases: [...aliases], allergens: useAllergens ? s.allergens ?? [] : null, usePrice: usePrice && !!s.price,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const names = (xs: AllergenId[] | null | undefined) => (xs?.length ? xs.map(allergenName).join("・") : "なし");
  return (
    <li className={`${ui.card} space-y-2`}>
      <div className="flex items-baseline gap-2">
        <span className={`rounded px-1.5 text-[11px] font-bold ${s.source === "ai" ? "bg-sand text-ink-soft" : "bg-clay-soft text-clay-strong"}`}>{s.source === "ai" ? "AIの推定" : `お店：${s.orgName}`}</span>
        <span className="text-xs text-muted">{s.kind === "new" ? "新しい材料" : `「${s.globalName}」への追加`}</span>
      </div>
      {s.kind === "new" ? (
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block space-y-1"><span className={ui.label}>名前</span><input className={ui.input} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block space-y-1"><span className={ui.label}>分類</span><input className={ui.input} value={category} onChange={(e) => setCategory(e.target.value)} /></label>
        </div>
      ) : <p className="font-bold">{s.name}{g && s.name !== g.name ? <span className="ml-1 text-xs font-normal text-muted">→ {g.name}</span> : null}</p>}

      {s.aliases.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted">共有に足す呼び方（次から、どのお店でもこの名前で結びつきます）</p>
          <div className="flex flex-wrap gap-1.5">
            {s.aliases.map((a) => (
              <label key={a} className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-sm">
                <input type="checkbox" className="accent-clay" checked={aliases.has(a)} onChange={(e) => {
                  const n = new Set(aliases);
                  if (e.target.checked) n.add(a);
                  else n.delete(a);
                  setAliases(n);
                }} />{a}
              </label>
            ))}
          </div>
        </div>
      )}

      {s.allergens && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-clay" checked={useAllergens} onChange={(e) => setUseAllergens(e.target.checked)} />
          <span>アレルゲンを「{names(s.allergens)}」にする{g && <span className="block text-xs text-muted">今の共有：{names(g.allergens)}。商品によって違うものは変えないでください。</span>}</span>
        </label>
      )}

      {s.price && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-clay" checked={usePrice} onChange={(e) => setUsePrice(e.target.checked)} />
          <span>
            参考価格にする：{yen(s.price.price)}（税抜）/{s.price.qty}{s.price.unit}
            {s.note && <span className="block text-xs text-muted">{s.note}</span>}
            {g?.refPrice && <span className="block text-xs text-muted">今の参考価格：{yen(g.refPrice.price)}（税込）/{g.refPrice.qty}{g.refPrice.unit}・{g.refPrice.source}</span>}
          </span>
        </label>
      )}
      {s.labelName && <p className="text-xs text-muted">お店のラベルの名前：{s.labelName}</p>}
      {err && <p className="text-sm text-ng">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => decide(false)} className={ui.secondary}>却下</button>
        <button disabled={busy || (s.kind === "new" && !name.trim())} onClick={() => decide(true)} className={ui.primary}>{busy ? "保存しています…" : "採用"}</button>
      </div>
    </li>
  );
}
