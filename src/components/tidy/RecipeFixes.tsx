// データの整理のうち、レシピを直すもの：何個分・名前・同じ材料の行。保存は tidyRecipes（前の版は履歴に残る）
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Recipe } from "@shared/types";
import { call } from "../../lib/store";
import { ui } from "../common/ui";

type Patch = { recipeId: string; pieces?: number; name?: string; mergeDuplicates?: boolean };

async function send(orgId: string, patches: Patch[]): Promise<string> {
  if (!patches.length) return "直すものがありません。";
  let done = 0;
  for (let i = 0; i < patches.length; i += 50) {
    const r = await call<{ done: number; failed: unknown[] }>("tidyRecipes", { orgId, patches: patches.slice(i, i + 50) });
    done += r.done;
  }
  return `${done}件を保存しました。`;
}

function useSend(orgId: string) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async (patches: Patch[]) => {
    setBusy(true);
    setMsg("");
    try {
      setMsg(await send(orgId, patches));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

/** 何個分：推定があれば初めから入れておく。空のままの行は保存しない */
export function PiecesFix({ orgId, rows }: { orgId: string; rows: { r: Recipe; grams: number; guess: number | null }[] }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const { busy, msg, run } = useSend(orgId);
  if (!rows.length) return <p className="text-sm text-muted">見直しが必要なレシピはありません。</p>;
  const val = (x: { r: Recipe; guess: number | null }) => vals[x.r.id] ?? (x.guess ? String(x.guess) : "");
  const patches = rows.flatMap((x) => {
    const n = Number(val(x));
    return n > 1 ? [{ recipeId: x.r.id, pieces: n }] : [];
  });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">書かれた分量で何個（枚・本・切れ）できるかを入れてください。メモや工程に「〇個分」とあれば、先に入れています。</p>
      <ul className="divide-y divide-line">
        {rows.map((x) => (
          <li key={x.r.id} className="flex items-center gap-2 py-2">
            <Link to={`/recipes/${x.r.id}`} className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline">{x.r.name}<span className="ml-1 text-xs text-muted">{Math.round(x.grams)}g</span></Link>
            <input className="w-16 rounded-lg border border-line-strong px-2 py-1.5 text-right text-sm" inputMode="numeric" placeholder="個数" value={val(x)}
              onChange={(e) => setVals({ ...vals, [x.r.id]: e.target.value.replace(/\D/g, "") })} />
            <span className="text-sm">個分</span>
          </li>
        ))}
      </ul>
      <button disabled={busy || !patches.length} onClick={() => run(patches)} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : `入れた${patches.length}件を保存する`}</button>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}

/** 名前のないレシピ・レシピでないもの：名前を付けるか、しまう */
export function NamesFix({ orgId, list }: { orgId: string; list: Recipe[] }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const { busy, msg, run } = useSend(orgId);
  const shown = list.filter((r) => !hidden.includes(r.id));
  if (!shown.length) return <p className="text-sm text-muted">見直しが必要なレシピはありません。</p>;
  const patches = Object.entries(names).filter(([, v]) => v.trim()).map(([recipeId, name]) => ({ recipeId, name }));

  async function archive(r: Recipe) {
    setHidden([...hidden, r.id]);
    await call("archiveRecipe", { orgId, recipeId: r.id, archived: true }).catch(() => setHidden((h) => h.filter((x) => x !== r.id)));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">材料の1行目・工程の書き出しを見て、名前を付けてください。レシピでないもの（材料のメモなど）は「しまう」で一覧から外せます（消えません）。</p>
      <ul className="divide-y divide-line">
        {shown.map((r) => (
          <li key={r.id} className="space-y-1 py-2.5">
            <div className="flex items-center gap-2">
              <input className="min-w-0 flex-1 rounded-lg border border-line-strong px-2 py-1.5 text-sm" placeholder={r.name} value={names[r.id] ?? ""} onChange={(e) => setNames({ ...names, [r.id]: e.target.value })} />
              <button onClick={() => archive(r)} className="shrink-0 text-xs text-muted underline">しまう</button>
            </div>
            <p className="truncate text-xs text-muted">
              <Link to={`/recipes/${r.id}`} className="underline">開く</Link>　{r.items.slice(0, 4).map((i) => i.name).join("・") || "材料なし"}{r.steps[0] ? `／${r.steps[0].text.slice(0, 30)}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <button disabled={busy || !patches.length} onClick={() => run(patches)} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : `名前を入れた${patches.length}件を保存する`}</button>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}

/** 同じ材料が何行かに分かれているレシピ：量を足して1行に */
export function DupRows({ orgId, rows }: { orgId: string; rows: { r: Recipe; names: string[] }[] }) {
  const { busy, msg, run } = useSend(orgId);
  if (!rows.length) return <p className="text-sm text-muted">分かれている行はありません。</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">「生地用」「仕上げ用」のように分けて書きたい行は、まとめずに残してください（まとめると原価とラベルは同じで、作業モードの行が1つになります）。</p>
      <ul className="divide-y divide-line">
        {rows.map(({ r, names }) => (
          <li key={r.id} className="flex items-center gap-2 py-2 text-sm">
            <Link to={`/recipes/${r.id}`} className="min-w-0 flex-1 truncate">{r.name}<span className="ml-1 text-xs text-muted">{names.join("・")}</span></Link>
            <button disabled={busy} onClick={() => run([{ recipeId: r.id, mergeDuplicates: true }])} className="shrink-0 text-xs text-clay-strong underline">まとめる</button>
          </li>
        ))}
      </ul>
      <button disabled={busy} onClick={() => run(rows.map(({ r }) => ({ recipeId: r.id, mergeDuplicates: true })))} className={`w-full ${ui.secondary}`}>
        {busy ? "まとめています…" : `${rows.length}件すべてまとめる`}
      </button>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
