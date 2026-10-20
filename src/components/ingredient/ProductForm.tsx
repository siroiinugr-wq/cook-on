// 既製品の登録。パッケージの表と裏を撮ると、AIが原材料名・アレルゲン・栄養成分を下書きする（1枚1クレジット）。
// AIの下書きは「たたき台」で、パッケージと見比べて直してから登録する。
// 登録するとお店の材料に入る。お店の設定（shareProducts）がオンなら、みんなの既製品データベースにも入る（初めてのときに1回だけ聞く）
import { useState } from "react";
import { ALLERGENS, type AllergenId } from "@shared/allergens";
import { CREDIT_COST } from "@shared/credits";
import { NUTRIENT_LABELS } from "@shared/mext";
import { NUTRITION_KEYS } from "@shared/ugc";
import { useOrgCtx } from "../../contexts/OrgContext";
import { createIngredient } from "../../lib/ingredientLink";
import { uploadUgcPhoto } from "../../lib/photos";
import { call, newRequestId, saveDoc } from "../../lib/store";
import { CostTag } from "../common/CreditBadge";
import { useConfirm } from "../common/ConfirmDialog";
import { Sheet } from "../common/Sheet";
import { useCreditAction } from "../common/useCreditAction";
import { ui } from "../common/ui";
import { PackagePhotos, type PackageShots } from "./PackagePhotos";

interface Guess { maker?: string; productName?: string; ingredientsText: string; allergens: AllergenId[]; nutrition?: Record<string, number>; photoPath?: string; confidence: number; note: string }

export function ProductForm({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const { orgId, uid, org, isAdmin } = useOrgCtx();
  const [maker, setMaker] = useState("");
  const [productName, setProductName] = useState("");
  const [text, setText] = useState("");
  const [allergens, setAllergens] = useState<AllergenId[]>([]);
  const [nutrition, setNutrition] = useState<Record<string, string>>({});
  const [shots, setShots] = useState<PackageShots>({ front: null, back: null });
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = useCreditAction(org.credits);
  const confirm = useConfirm();
  const toggle = (a: AllergenId) => setAllergens(allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a]);
  const files = [shots.front, shots.back].filter((f): f is File => !!f);

  function apply(r: Guess) {
    if (r.maker) setMaker(r.maker);
    if (r.productName) setProductName(r.productName);
    setText(r.ingredientsText);
    setAllergens(r.allergens);
    setNutrition(Object.fromEntries(Object.entries(r.nutrition ?? {}).map(([k, v]) => [k, String(v)])));
    if (r.photoPath) setPhotoPath(r.photoPath);
    setNote(`${r.confidence < 0.6 ? "自信が低い下書きです。" : ""}${r.note}`);
  }

  async function go(title: string, credits: number, exec: () => Promise<Guess>) {
    setBusy(true);
    setErr("");
    try {
      const r = await run({ title, credits, exec });
      if (r) apply(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const readPhotos = () => go("パッケージの写真をAIで読み取る", CREDIT_COST.productPhoto * files.length, async () => {
    const draftId = newRequestId();
    const paths = await Promise.all(files.map((f, i) => uploadUgcPhoto(orgId, draftId, i === 0 ? "a" : "b", f)));
    return call<Guess>("readProductPhoto", { orgId, draftId, paths, requestId: newRequestId() });
  });
  const guessByName = () => go("既製品の情報をAIで下書き", CREDIT_COST.productGuess,
    () => call<Guess>("guessProduct", { orgId, maker, productName, requestId: newRequestId() }));

  /** みんなのデータベースにも入れるか。まだ決めていなければ1回だけ聞き、管理者なら設定に覚える */
  async function shouldShare(): Promise<boolean> {
    if (org.settings.shareProducts !== null) return org.settings.shareProducts;
    const yes = await confirm({
      title: "みんなの既製品データベースにも入れますか？",
      body: "ほかのお店の確認が集まると、どのお店でも材料の候補に出ます。お店の名前は出ません。この答えはお店の設定に覚えて、次からは聞きません（設定の画面で変えられます）。",
      ok: "入れる", cancel: "お店の材料だけ",
    });
    if (isAdmin) await saveDoc(`organizations/${orgId}`, { settings: { ...org.settings, shareProducts: yes } }).catch(() => undefined);
    return yes;
  }

  async function submit() {
    setErr("");
    const share = await shouldShare();
    setBusy(true);
    try {
      const n = Object.fromEntries(NUTRITION_KEYS.flatMap((k) => (nutrition[k]?.trim() && Number.isFinite(Number(nutrition[k])) ? [[k, Number(nutrition[k])]] : [])));
      let existed = false;
      if (share) existed = (await call<{ existed: boolean }>("submitUgcProduct", { orgId, maker, productName, ingredientsText: text, allergens, nutrition: n, photoPath })).existed;
      await createIngredient(orgId, uid, { name: productName.trim(), labelName: `${productName.trim()}（${text.trim()}）`.slice(0, 300), allergens, photoPath });
      onDone(`「${productName.trim()}」をお店の材料に加えました。${share ? (existed ? "みんなの一覧には同じ商品がもうありました。" : "みんなの一覧にも登録しました。") : ""}仕入れ値は「材料」の画面で入れてください。`);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="既製品を登録" onClose={onClose}>
      <div className="space-y-3">
        <PackagePhotos shots={shots} onChange={setShots} />
        <button disabled={busy || !files.length} onClick={readPhotos} className={`w-full ${ui.primary} text-sm`}>
          {busy ? "読み取っています…" : "写真からAIで読み取る"}{files.length > 0 && <CostTag credits={CREDIT_COST.productPhoto * files.length} />}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={ui.label}>メーカー</span><input className={ui.input} value={maker} maxLength={40} onChange={(e) => setMaker(e.target.value)} /></label>
          <label className="space-y-1"><span className={ui.label}>商品名</span><input className={ui.input} value={productName} maxLength={60} onChange={(e) => setProductName(e.target.value)} /></label>
        </div>
        {!files.length && (
          <button disabled={busy || !maker.trim() || !productName.trim()} onClick={guessByName} className={`w-full ${ui.secondary} text-sm`}>
            写真が無いとき：名前からAIで下書き<CostTag credits={CREDIT_COST.productGuess} />
          </button>
        )}
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
        <div className="space-y-1">
          <p className={ui.label}>栄養成分（100gあたり。分からなければ空のまま）</p>
          <div className="grid grid-cols-3 gap-2">
            {NUTRITION_KEYS.map((k) => (
              <label key={k} className="space-y-0.5"><span className="text-[11px] text-muted">{NUTRIENT_LABELS[k]}（{k === "kcal" ? "kcal" : "g"}）</span>
                <input className={ui.input} inputMode="decimal" value={nutrition[k] ?? ""} onChange={(e) => setNutrition({ ...nutrition, [k]: e.target.value.replace(/[^\d.]/g, "") })} /></label>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !maker.trim() || !productName.trim() || !text.trim()} onClick={submit} className={`w-full ${ui.primary}`}>登録する</button>
        <p className="text-xs text-muted">{org.settings.shareProducts === false ? "お店の材料にだけ入ります（設定の画面で、みんなの一覧にも入れるようにできます）。" : "みんなの一覧に入れた内容は、ほかのお店も見られます。お店の名前は出ません。"}</p>
      </div>
    </Sheet>
  );
}
