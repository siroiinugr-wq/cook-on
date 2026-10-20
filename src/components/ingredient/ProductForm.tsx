// 既製品の登録。パッケージの原材料名をそのまま写してもらう。AIの下書きは「たたき台」で、パッケージで確かめる前提
import { useState } from "react";
import { ALLERGENS, type AllergenId } from "@shared/allergens";
import { CREDIT_COST } from "@shared/credits";
import { call, newRequestId } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { Sheet } from "../common/Sheet";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";

interface Guess { ingredientsText: string; allergens: AllergenId[]; confidence: number; note: string }

export function ProductForm({ orgId, credits, onClose, onDone }: { orgId: string; credits: number; onClose: () => void; onDone: (msg: string) => void }) {
  const [maker, setMaker] = useState("");
  const [productName, setProductName] = useState("");
  const [text, setText] = useState("");
  const [allergens, setAllergens] = useState<AllergenId[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = useCreditAction(credits);
  const toggle = (a: AllergenId) => setAllergens(allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a]);

  async function guess() {
    setBusy(true);
    setErr("");
    try {
      const r = await run({
        title: "既製品の情報をAIで下書き", credits: CREDIT_COST.productGuess,
        exec: () => call<Guess>("guessProduct", { orgId, maker, productName, requestId: newRequestId() }),
      });
      if (!r) return;
      setText(r.ingredientsText);
      setAllergens(r.allergens);
      setNote(`${r.confidence < 0.6 ? "自信が低い下書きです。" : ""}${r.note}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const r = await call<{ existed: boolean }>("submitUgcProduct", { orgId, maker, productName, ingredientsText: text, allergens });
      onDone(r.existed ? "同じ商品がもう登録されていました。一覧から評価できます。" : "登録しました。ほかのお店の確認が集まると、共有の材料になります。");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="既製品を登録" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={ui.label}>メーカー</span><input className={ui.input} value={maker} maxLength={40} onChange={(e) => setMaker(e.target.value)} /></label>
          <label className="space-y-1"><span className={ui.label}>商品名</span><input className={ui.input} value={productName} maxLength={60} onChange={(e) => setProductName(e.target.value)} /></label>
        </div>
        <button disabled={busy || !maker.trim() || !productName.trim()} onClick={guess} className={`w-full ${ui.secondary} text-sm`}>
          原材料とアレルゲンをAIで下書き<CostTag credits={CREDIT_COST.productGuess} />
        </button>
        {note && <p className="rounded-xl bg-warn-soft p-2 text-xs text-warn-strong">{note} 必ずパッケージの表示と見比べてください。</p>}
        <label className="block space-y-1"><span className={ui.label}>原材料名（パッケージのとおりに）</span>
          <textarea className={`${ui.input} h-24`} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="砂糖、カカオマス、全粉乳、ココアバター／乳化剤（大豆由来）、香料" /></label>
        <div className="space-y-1">
          <p className={ui.label}>アレルゲン</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <button key={a.id} onClick={() => toggle(a.id)} className={`rounded-full border px-2.5 py-1 text-xs ${allergens.includes(a.id) ? "border-clay bg-clay-soft font-bold text-clay-strong" : "border-line text-muted"}`}>{a.name}</button>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !maker.trim() || !productName.trim() || !text.trim()} onClick={submit} className={`w-full ${ui.primary}`}>みんなの一覧に登録する</button>
        <p className="text-xs text-muted">登録した内容は、ほかのお店も見られます。お店の名前は出ません。</p>
      </div>
    </Sheet>
  );
}
