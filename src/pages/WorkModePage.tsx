// 作業モード（厨房のタブレット用）：大きな文字、画面が暗くならない、材料と工程にチェック。
// 濡れた手でも押せるよう、行ぜんたいを押すとチェックが付く。チェックはこの端末に覚える（読み込み直しても消えない）
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { calcCost, scaleFactor } from "@shared/cost";
import { formatQty } from "@shared/units";
import { useOrgCtx } from "../contexts/OrgContext";
import { useIngredients } from "../hooks/useIngredients";
import { useRecipe, useScale } from "../hooks/useRecipe";
import { useWakeLock } from "../hooks/useWakeLock";
import { usePhotoUrl } from "../lib/photos";
import { Icon } from "../components/common/Icon";

type Checks = { items: number[]; steps: number[] };
const EMPTY: Checks = { items: [], steps: [] };
const LOTS = [0.5, 1, 2, 2.5, 3];

function useChecks(key: string): [Checks, (c: Checks) => void] {
  const [c, setC] = useState<Checks>(() => {
    try {
      return { ...EMPTY, ...(JSON.parse(localStorage.getItem(key) ?? "null") as Checks | null) };
    } catch {
      return EMPTY;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(c));
    } catch {
      // 覚えられなくても、開いている間は使える
    }
  }, [key, c]);
  return [c, setC];
}

export function WorkModePage() {
  const { id } = useParams();
  const { orgId } = useOrgCtx();
  const { recipe, loading } = useRecipe(orgId, id);
  const ings = useIngredients(orgId);
  const [mode, setMode] = useScale();
  const [tab, setTab] = useState<"items" | "steps">("items");
  const [checks, setChecks] = useChecks(`cookon-work-${orgId}-${id}`);
  const awake = useWakeLock(true);

  if (loading) return <p className="p-10 text-center text-muted">読み込み中…</p>;
  if (!recipe) return <p className="p-10 text-center">レシピが見つかりません。<Link to="/" className="underline">一覧へ</Link></p>;

  const pieces = recipe.yield.pieces || 1;
  const factor = scaleFactor(mode, pieces);
  const grams = calcCost(recipe.items, ings.byId, factor).lines.map((l) => l.grams);
  const toggle = (k: keyof Checks, i: number) => setChecks({ ...checks, [k]: checks[k].includes(i) ? checks[k].filter((x) => x !== i) : [...checks[k], i] });
  const doneItems = checks.items.length;
  const doneSteps = checks.steps.length;

  return (
    <div className="work-mode min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-line bg-paper px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link to={`/recipes/${recipe.id}${window.location.search}`} className="rounded-xl border border-line-strong p-2" aria-label="作業モードを終える"><Icon name="close" className="h-7 w-7" /></Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold">{recipe.name}</h1>
            <p className="text-sm text-muted">{formatQty(Math.round(pieces * factor * 10) / 10)}個分（×{formatQty(factor)}）{awake ? "・画面は消えません" : ""}</p>
          </div>
          <button onClick={() => setChecks(EMPTY)} className="rounded-xl border border-line-strong px-3 py-2 text-base">最初から</button>
        </div>
        <div className="mx-auto mt-2 flex max-w-4xl gap-2 overflow-x-auto">
          {LOTS.map((l) => (
            <button key={l} onClick={() => setMode({ kind: "lot", lots: l })}
              className={`shrink-0 rounded-full px-4 py-1 text-base ${mode.kind === "lot" && mode.lots === l ? "bg-clay font-bold text-white" : "bg-sand"}`}>×{l}</button>
          ))}
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-2 px-4 pt-3">
        <button onClick={() => setTab("items")} className={`rounded-2xl py-3 ${tab === "items" ? "bg-ink text-white" : "bg-sand"}`}>材料 {doneItems}/{recipe.items.length}</button>
        <button onClick={() => setTab("steps")} className={`rounded-2xl py-3 ${tab === "steps" ? "bg-ink text-white" : "bg-sand"}`}>工程 {doneSteps}/{recipe.steps.length}</button>
      </div>

      <main className="mx-auto max-w-4xl space-y-2 p-4">
        {tab === "items" ? recipe.items.map((it, i) => {
          const on = checks.items.includes(i);
          const qty = it.qty === null ? null : it.qty * factor;
          return (
            <button key={i} onClick={() => toggle("items", i)} className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left ${on ? "border-ok bg-ok-soft text-muted line-through" : "border-line bg-paper"}`}>
              <Box on={on} />
              <span className="flex-1">{it.name}{it.note && <span className="block text-base text-muted no-underline">{it.note}</span>}</span>
              <span className="text-right font-bold">
                {it.unit === "適量" ? "適量" : `${formatQty(qty)}${it.unit}`}
                {grams[i] !== null && it.unit !== "g" && <span className="block text-base font-normal text-muted">{formatQty(grams[i])}g</span>}
              </span>
            </button>
          );
        }) : recipe.steps.map((s, i) => (
          <Step key={i} n={i + 1} text={s.text} photo={s.photoPath} on={checks.steps.includes(i)} onClick={() => toggle("steps", i)} />
        ))}
        {tab === "items" && doneItems === recipe.items.length && recipe.steps.length > 0 && (
          <button onClick={() => setTab("steps")} className="w-full rounded-2xl bg-clay py-4 font-bold text-white">材料がそろいました。工程へ</button>
        )}
      </main>
    </div>
  );
}

function Box({ on }: { on: boolean }) {
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-ok bg-ok text-white" : "border-line-strong"}`}>{on && <Icon name="check" className="h-6 w-6" />}</span>;
}

function Step({ n, text, photo, on, onClick }: { n: number; text: string; photo?: string | null; on: boolean; onClick: () => void }) {
  const url = usePhotoUrl(photo);
  return (
    <button onClick={onClick} className={`flex w-full gap-4 rounded-2xl border-2 p-4 text-left ${on ? "border-ok bg-ok-soft text-muted" : "border-line bg-paper"}`}>
      <Box on={on} />
      <span className="flex-1 space-y-2">
        <span className="block"><b className="mr-2 text-clay-strong">{n}</b><span className={on ? "line-through" : ""}>{text}</span></span>
        {url && <img src={url} alt="" className="max-h-64 rounded-xl object-cover" />}
      </span>
    </button>
  );
}
