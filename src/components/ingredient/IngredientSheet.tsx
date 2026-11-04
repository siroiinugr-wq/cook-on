// 材料の登録・編集。仕入れ値を変えると、使っているレシピの原価が自動で計算し直され、目標を超えたらお知らせが出る
import { useState } from "react";
import { Link } from "react-router-dom";
import { ALLERGENS, allergenName, type AllergenId } from "@shared/allergens";
import { fromExTax, PRICE_TAX_OPTIONS, toExTax, unitCostPerGram, yen } from "@shared/cost";
import type { Ingredient, Recipe } from "@shared/types";
import { madeFromCandidates, madeFromPartial, madeFromPatch, usesIngredient } from "@shared/madeFrom";
import { NUTRIENT_LABELS } from "@shared/mext";
import { UNITS, type Unit } from "@shared/units";
import { useCol } from "../../hooks/useData";
import { removeDoc, saveDoc, toDate } from "../../lib/store";
import { createIngredient } from "../../lib/ingredientLink";
import { uploadPhoto } from "../../lib/photos";
import { Accordion } from "../common/Accordion";
import { useConfirm } from "../common/ConfirmDialog";
import { Sheet } from "../common/Sheet";
import { ui } from "../common/ui";
import { RefBadge } from "./RefBadge";
import { GlobalInfo } from "./GlobalInfo";
import { PhotoThumb } from "./PhotoThumb";
import { WebSources } from "../common/WebSources";
import { ProductForm } from "./ProductForm";
import { WebOfferList } from "./WebOfferList";
import { offerPatch, OFFER_TAX, webPriceInUse, type RefWeb } from "@shared/offers";
import { per100 } from "@shared/invoice";
import { numText } from "../../lib/num";
import { fmtAt } from "../../lib/date";

const BUY_UNITS = UNITS.filter((u) => u !== "適量");
const PIECE: Unit[] = ["個", "枚", "本"];
const LIQUID: Unit[] = ["ml", "l", "大さじ", "小さじ", "カップ"];
type Hist = { from: { price: number | null; qty: number; unit: string }; to: { price: number | null; qty: number; unit: string }; at: unknown };

export function IngredientSheet({ orgId, uid, ing, usedIn, usedBy = [], recipes = [], ingById, onClose }: {
  orgId: string; uid: string; ing: Ingredient | null; usedIn: number; usedBy?: { id: string; name: string }[];
  /** 自家製の材料の結び先を選ぶためのレシピと材料（無ければ自家製の欄を出さない） */
  recipes?: Recipe[]; ingById?: Map<string, Ingredient>; onClose: () => void;
}) {
  const [d, setD] = useState<Omit<Ingredient, "id">>(ing ?? { name: "", purchasePrice: null, purchaseQty: 1, purchaseUnit: "kg", allergens: [], globalRef: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const confirm = useConfirm();
  // 既製品として登録する（パッケージの裏を撮るとAIが原材料・アレルゲンを読む）。この材料はそのまま残る
  const [asProduct, setAsProduct] = useState(false);
  const hist = useCol<Hist>(ing ? `organizations/${orgId}/ingredients/${ing.id}/priceHistory` : null, { orderBy: ["at", "desc"], limit: 10 });
  const set = (p: Partial<Ingredient>) => setD({ ...d, ...p });
  const num = (v: string) => (v.trim() === "" ? null : Number(numText(v)));
  // 値段の欄は「入れた形」（税込なら税込）で出し、保存する purchasePrice は税抜に直す
  const tax = d.priceTax ?? 0;
  const [priceText, setPriceText] = useState(d.purchasePrice === null ? "" : String(fromExTax(d.purchasePrice, tax)));
  const setPrice = (text: string, rate = tax) => {
    setPriceText(text);
    const n = num(text);
    set({ purchasePrice: n === null ? null : toExTax(n, rate), priceTax: rate, priceSource: null });
  };
  // 自家製の材料：結んだレシピから値段・アレルゲンを計算して見せる（保存するとこの値が入り、以後はサーバーが入れ直す）
  const madeRecipe = d.madeFrom ? recipes.find((r) => r.id === d.madeFrom) : undefined;
  const made = madeRecipe && ingById ? madeFromPatch(madeRecipe.items, ingById) : null;
  const shownD = made ? { ...d, ...made } : d;
  const perG = unitCostPerGram(shownD);
  const toggle = (a: AllergenId) => set({ allergens: d.allergens.includes(a) ? d.allergens.filter((x) => x !== a) : [...d.allergens, a] });

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const { missing: _m, ...madeData } = made ?? { missing: 0 };
      const data = {
        name: d.name.trim(), purchasePrice: d.purchasePrice, priceTax: d.priceTax ?? 0, purchaseQty: d.purchaseQty || 1, purchaseUnit: d.purchaseUnit,
        gramsPerPiece: d.gramsPerPiece ?? null, gramsPerMl: d.gramsPerMl ?? null, allergens: d.allergens, allergensConfirmed: true,
        aliases: (d.aliases ?? []).filter((a) => a.trim() && a.trim() !== d.name.trim()).slice(0, 20),
        labelName: d.labelName?.trim() ?? "", isAdditive: !!d.isAdditive, supplier: d.supplier?.trim() ?? "", globalRef: d.globalRef ?? null,
        photoPath: d.photoPath ?? null, priceSource: d.purchasePrice === null ? null : d.priceSource ?? null,
        // ネットで調べた参考価格の出典は、参考価格のままのときだけ残す
        refWeb: d.refWeb ?? null,
        madeFrom: d.madeFrom ?? null,
        ...(made ? madeData : {}),
        // レシピから外したら、レシピから計算した成分も消す（仕入れる材料は共有の材料の成分を使う）
        ...(!d.madeFrom && ing?.madeFrom ? { nutrition: null, nutritionMissing: null } : {}),
      };
      if (ing) await saveDoc(`organizations/${orgId}/ingredients/${ing.id}`, data);
      else await createIngredient(orgId, uid, data);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした。");
      setBusy(false);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      set({ photoPath: await uploadPhoto(`orgs/${orgId}/ingredients`, file, 800) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を上げられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!ing) return;
    const ok = await confirm({ title: `「${ing.name}」を消しますか？`, body: usedIn ? `${usedIn}件のレシピで使っています。レシピには名前が残りますが、原価とアレルゲンに入らなくなります。` : "元に戻せません。", ok: "消す" });
    if (!ok) return;
    await removeDoc(`organizations/${orgId}/ingredients/${ing.id}`);
    onClose();
  }

  const input = ui.input;
  if (asProduct && ing) return <ProductForm from={ing} onClose={() => setAsProduct(false)} onDone={() => onClose()} />;
  return (
    <Sheet title={ing ? "材料を編集" : "材料を登録"} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <label className="block flex-1 space-y-1"><span className={ui.label}>材料名</span><input className={input} value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
          <PhotoThumb path={d.photoPath} className="h-11 w-11" />
        </div>
        <div className="flex gap-3 text-sm">
          <label className="cursor-pointer text-clay-strong underline">{d.photoPath ? "写真を替える" : "写真を付ける"}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => pickPhoto(e.target.files?.[0])} /></label>
          {d.photoPath && <button type="button" className="text-muted underline" onClick={() => set({ photoPath: null })}>写真を外す</button>}
        </div>
        {ingById && recipes.length > 0 && (
          <MadeFrom ing={ing} d={d} recipes={recipes} ingById={ingById} made={made} perG={perG} onPick={(madeFrom) => set({ madeFrom })} />
        )}
        {!made && <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={ui.label}>仕入れ値</span>
            <div className="flex overflow-hidden rounded-lg border border-line text-xs">
              {PRICE_TAX_OPTIONS.map((o) => (
                <button key={o.rate} type="button" onClick={() => setPrice(priceText, o.rate)}
                  className={`px-2 py-1 ${tax === o.rate ? "bg-clay font-bold text-white" : "text-muted"}`}>{o.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input className={`${input} w-28`} inputMode="decimal" placeholder="未入力" value={priceText} onChange={(e) => setPrice(e.target.value)} />
            <span className="shrink-0 text-sm">円で</span>
            <input className={`${input} w-20`} inputMode="decimal" value={d.purchaseQty} onChange={(e) => set({ purchaseQty: num(e.target.value) ?? 1, priceSource: null })} />
            <select className={`${input} w-24`} value={d.purchaseUnit} onChange={(e) => set({ purchaseUnit: e.target.value as Unit, priceSource: null })}>{BUY_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          {tax > 0 && d.purchasePrice !== null && <p className="text-xs text-muted">税抜 {yen(d.purchasePrice)} で原価を計算します。</p>}
        {d.priceSource === "ref" && d.purchasePrice !== null && (
          <p className="text-xs text-warn-strong">
            <RefBadge /> {webPriceInUse(d) ? "AIがネットの販売価格を調べて入れた目安です" : "共有の材料の参考価格を入れています"}。お店の仕入れ値に直すと、この印は消えます{webPriceInUse(d) ? "（調べた値段の記録は下に残ります）" : ""}。
          </p>
        )}
        {d.refWeb && <WebPriceRecord w={d.refWeb} ing={d} />}
          <p className="text-xs text-muted">{perG !== null ? `1gあたり ${yen(perG)}（税抜）／1kgあたり ${yen(perG * 1000)}` : "1gあたりの値段を出すには、仕入れ値と量を入れてください。"}</p>
        </div>}
        {!made && <>
        {ing && <WebOfferList ing={{ ...ing, ...d, id: ing.id }} onUse={(o) => { const p = offerPatch(o); setPriceText(String(o.price)); set(p); }} />}
        {d.globalRef && <GlobalInfo globalRef={d.globalRef} onApply={(p) => { setPriceText(String(p.price)); set({ purchasePrice: p.price, priceTax: 0, purchaseQty: p.qty, purchaseUnit: p.unit, priceSource: "ref" }); }} />}
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className={ui.label}>1個・1枚・1本の重さ g{PIECE.includes(d.purchaseUnit) ? "（必要）" : ""}</span>
            <input className={input} inputMode="decimal" value={d.gramsPerPiece ?? ""} onChange={(e) => set({ gramsPerPiece: num(e.target.value) })} /></label>
          <label className="space-y-1"><span className={ui.label}>1mlの重さ g{LIQUID.includes(d.purchaseUnit) ? "（無ければ1）" : ""}</span>
            <input className={input} inputMode="decimal" placeholder="1" value={d.gramsPerMl ?? ""} onChange={(e) => set({ gramsPerMl: num(e.target.value) })} /></label>
        </div>
        </>}
        {!made && <div className="space-y-1">
          <p className={ui.label}>アレルゲン（含むものを押す）{ing && ing.allergensConfirmed !== true && <span className="ml-1 text-warn-strong">まだ確かめていません。保存すると「確認済み」になります</span>}</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <button key={a.id} type="button" onClick={() => toggle(a.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${d.allergens.includes(a.id) ? "border-clay bg-clay-soft font-bold text-clay-strong" : a.required ? "border-line-strong" : "border-line text-muted"}`}>{a.name}</button>
            ))}
          </div>
        </div>}
        <div className="space-y-1">
          <p className={ui.label}>別名（レシピでの呼び方。取り込みのとき、この名前もこの材料に結びつきます）</p>
          <Aliases list={d.aliases ?? []} set={(aliases) => set({ aliases })} />
        </div>
        <Accordion title="ラベル・仕入れ先" summary={d.labelName ? `ラベル：${d.labelName}` : "ラベル（品質表示）に出す名前を変えるとき"} defaultOpen={!!ing && !d.labelName}>
          <div className="space-y-2">
            <label className="block space-y-1"><span className={ui.label}>ラベルに出す名前（既製品は中身まで。例：チョコレート（砂糖、カカオマス、ココアバター））</span>
              <textarea className={`${input} h-16`} value={d.labelName ?? ""} maxLength={300} onChange={(e) => set({ labelName: e.target.value })} /></label>
            {ing && (
              <button type="button" onClick={() => setAsProduct(true)} className="text-sm text-clay-strong underline">
                既製品として登録する（パッケージの裏を撮ると、AIが原材料・アレルゲン・栄養成分を読みます）
              </button>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.isAdditive} onChange={(e) => set({ isAdditive: e.target.checked })} />添加物（ラベルで「／」のあとに書く）</label>
            <label className="block space-y-1"><span className={ui.label}>仕入れ先</span><input className={input} value={d.supplier ?? ""} maxLength={60} onChange={(e) => set({ supplier: e.target.value })} /></label>
          </div>
        </Accordion>
        {ing && hist.list.length > 0 && (
          <Accordion title="値段の記録" summary={`${hist.list.length}回変わっています`}>
            <ul className="space-y-1 text-sm">
              {hist.list.map((h) => (
                <li key={h.id} className="flex justify-between gap-2"><span className="text-muted">{toDate(h.at)?.toLocaleDateString("ja-JP") ?? ""}</span>
                  <span>{yen(h.from.price)}/{h.from.qty}{h.from.unit} → <b>{yen(h.to.price)}</b>/{h.to.qty}{h.to.unit}</span></li>
              ))}
            </ul>
          </Accordion>
        )}
        {ing && usedIn > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted">{usedIn}件のレシピで使っています。値段を変えると、その原価も自動で計算し直します。</p>
            {usedBy.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {usedBy.slice(0, 12).map((r) => <Link key={r.id} to={`/recipes/${r.id}`} className={`${ui.chip} text-clay-strong`}>{r.name}</Link>)}
                {usedBy.length > 12 && <span className="text-xs text-muted">ほか{usedBy.length - 12}件</span>}
              </div>
            )}
          </div>
        )}
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !d.name.trim()} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "保存する"}</button>
        {ing && <button onClick={remove} className={`w-full ${ui.quiet} text-ng`}>この材料を消す</button>}
      </div>
    </Sheet>
  );
}

/** 自家製の材料：作るレシピを選ぶ。名前が同じレシピを先に出し、この材料を使うレシピ（ぐるぐる回る）は出さない */
function MadeFrom({ ing, d, recipes, ingById, made, perG, onPick }: {
  ing: Ingredient | null; d: Omit<Ingredient, "id">; recipes: Recipe[]; ingById: Map<string, Ingredient>;
  made: ReturnType<typeof madeFromPatch> | null; perG: number | null; onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(!!d.madeFrom);
  const madeOf = new Map([...ingById.values()].flatMap((i) => (i.madeFrom ? [[i.id, i.madeFrom] as const] : [])));
  const recIngs = new Map(recipes.map((r) => [r.id, r.ingredientIds ?? []]));
  const ok = recipes.filter((r) => !ing || !usesIngredient(r.id, ing.id, recIngs, madeOf));
  const exact = madeFromCandidates({ name: d.name, aliases: d.aliases }, ok);
  const cands = [...exact, ...madeFromPartial({ name: d.name, aliases: d.aliases }, ok).filter((r) => !exact.includes(r))];
  const rest = ok.filter((r) => !cands.includes(r)).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const cur = d.madeFrom ? recipes.find((r) => r.id === d.madeFrom) : undefined;

  if (!open && !d.madeFrom) {
    return (
      <div className="rounded-xl bg-sand p-3 text-sm">
        {cands.length > 0 ? (
          <p>{exact.length ? "同じ名前" : "名前の近い"}のレシピ「{cands[0].name}」があります。<button type="button" className="text-clay-strong underline" onClick={() => { onPick(cands[0].id); setOpen(true); }}>このレシピから作る材料にする</button></p>
        ) : (
          <button type="button" className="text-clay-strong underline" onClick={() => setOpen(true)}>お店で作る材料（タルト生地・クリームなど）なら、作るレシピを選ぶ</button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-line bg-sand p-3">
      <label className="block space-y-1"><span className={ui.label}>お店で作る材料：作るレシピ</span>
        <select className={ui.input} value={d.madeFrom ?? ""} onChange={(e) => onPick(e.target.value || null)}>
          <option value="">自家製ではない（仕入れる材料）</option>
          {cands.length > 0 && <optgroup label="同じ・近い名前のレシピ">{cands.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
          <optgroup label="ほかのレシピ">{rest.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
        </select>
      </label>
      {cur && made && (
        <div className="space-y-1 text-sm">
          <p>
            材料の合計 <b>{made.purchaseQty.toLocaleString("ja-JP")}g</b> で <b>{made.purchasePrice === null ? "—" : yen(made.purchasePrice)}</b>
            {perG !== null && <span className="text-muted">（1gあたり {yen(perG)}）</span>}
          </p>
          {made.missing > 0 && <p className="text-xs text-warn-strong">レシピの材料のうち{made.missing}行は値段か重さが分からないので、まだ原価に入りません。レシピの材料を直すと入ります。</p>}
          <p className="text-xs">アレルゲン：{made.allergens.length ? made.allergens.map(allergenName).join("・") : "なし"}
            {!made.allergensConfirmed && <span className="ml-1 text-warn-strong">（中身にまだ確かめていない材料があります）</span>}</p>
          <MadeNutrition ing={ing} recipeId={cur.id} />
          <p className="text-xs text-muted">値段・アレルゲン・成分は「<Link to={`/recipes/${cur.id}`} className="text-clay-strong underline">{cur.name}</Link>」の材料から計算します。レシピや材料の値段を直すと、自動で入れ直します。</p>
        </div>
      )}
    </div>
  );
}

/** レシピの中身の成分表から計算した、100gあたりの成分（サーバーが入れる。結んだ直後は保存してから少し待つ） */
function MadeNutrition({ ing, recipeId }: { ing: Ingredient | null; recipeId: string }) {
  if (!ing || ing.madeFrom !== recipeId) return <p className="text-xs text-muted">成分（100gあたり）は、保存すると中身の成分表から計算して入ります。</p>;
  const n = ing.nutrition;
  if (!n || !Object.keys(n).length) return <p className="text-xs text-muted">成分：中身の材料が成分表に結ばれていないため、まだ出ません（データの整理の「共有の材料に結ぶ」で結べます）。</p>;
  const shown = ["kcal", "protein", "fat", "carbohydrate", "salt"].filter((k) => typeof n[k] === "number");
  return (
    <p className="text-xs">
      成分（100gあたり・目安）：{shown.map((k) => `${NUTRIENT_LABELS[k]} ${n[k]}${k === "kcal" ? "kcal" : "g"}`).join("・")}
      {(ing.nutritionMissing ?? 0) > 0 && <span className="ml-1 text-warn-strong">（中身の{ing.nutritionMissing}行は成分が分からず、0として計算）</span>}
    </p>
  );
}

/** 別名のチップ。入れて Enter（または「足す」）で増え、× で消える */
function Aliases({ list, set }: { list: string[]; set: (l: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const names = text.split(/[、,，\n]/).map((x) => x.trim().slice(0, 60)).filter(Boolean);
    if (names.length) set([...new Set([...list, ...names])].slice(0, 20));
    setText("");
  };
  return (
    <div className="space-y-1.5">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((a) => <button key={a} type="button" onClick={() => set(list.filter((x) => x !== a))} className={ui.chip}>{a} ×</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <input className={ui.input} value={text} placeholder="例：キビ糖、きび糖" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} disabled={!text.trim()} className={`${ui.secondary} shrink-0 py-2 text-sm`}>足す</button>
      </div>
    </div>
  );
}

/** AIがネットで調べた値段の記録。お店が仕入れ値を直しても残し、今の仕入れ値と100gあたりで比べる */
function WebPriceRecord({ w, ing }: { w: RefWeb; ing: Omit<Ingredient, "id"> }) {
  const web = w.price && w.qty && w.unit ? per100(w.price, OFFER_TAX, w.qty, w.unit, ing.gramsPerPiece) : null;
  const now = ing.purchasePrice !== null && !webPriceInUse(ing) ? per100(ing.purchasePrice, 0, ing.purchaseQty, ing.purchaseUnit, ing.gramsPerPiece) : null;
  const diff = web !== null && now ? Math.round(((now - web) / web) * 100) : null;
  return (
    <div className="space-y-1 rounded-xl border border-line p-3 text-xs">
      <p className="text-sm font-bold">AIがネットで調べた値段{w.at ? <span className="ml-1 text-[11px] font-normal text-muted">{fmtAt(w.at)}</span> : null}</p>
      {w.price && w.qty ? <p>税込 <b>{yen(w.price)}</b>／{w.qty}{w.unit}{web !== null && <span className="text-muted">（100gあたり税抜 {yen(web)}）</span>}</p> : null}
      <p className="text-muted">{w.note}</p>
      {diff !== null && diff !== 0 && <p className={diff < 0 ? "text-ok" : "text-ng"}>今の仕入れ値はネットより{diff < 0 ? `${-diff}%安い` : `${diff}%高い`}です（100gあたり・税抜）</p>}
      <WebSources sources={w.sources} searchHtml={w.searchHtml} />
    </div>
  );
}

