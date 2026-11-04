// お店で作る材料（タルト生地・クレームダマンド・クランブルなど）を、作るレシピに結ぶ。
// 結ぶと、材料の値段・アレルゲン・成分（100gあたり）がそのレシピの中身から入り、以後はレシピや値段を直すたびに自動で入れ直す
// （値段とアレルゲンは画面が書き、成分はサーバーが成分表を読んで入れる。shared/madeFrom.ts・recipes/madeFrom.ts）
import { useState } from "react";
import { Link } from "react-router-dom";
import { allergenName } from "@shared/allergens";
import { yen } from "@shared/cost";
import { madeFromPatch } from "@shared/madeFrom";
import type { Ingredient, Recipe } from "@shared/types";
import { call, saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

export function HomemadeLinks({ orgId, rows, hinted, ingById, linked }: {
  orgId: string; rows: { ing: Ingredient; recipe: Recipe; partial?: boolean }[]; hinted: Ingredient[]; ingById: Map<string, Ingredient>;
  /** もう結んである材料の数（入れ直しのボタン） */
  linked: number;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [skip, setSkip] = useState<Set<string>>(new Set());

  async function linkAll() {
    setBusy(true);
    setMsg("");
    let done = 0;
    try {
      for (const { ing, recipe } of rows.filter((x) => !skip.has(x.ing.id))) {
        const { missing: _m, ...p } = madeFromPatch(recipe.items, ingById);
        await saveDoc(`organizations/${orgId}/ingredients/${ing.id}`, { madeFrom: recipe.id, ...p });
        done += 1;
      }
      setMsg(`${done}件をレシピに結びました。使っているレシピの原価とアレルゲンも計算し直します。`);
    } catch {
      setMsg(`${done}件まで結びました。残りは保存できませんでした。もう一度お試しください。`);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ linked: number; updated: number }>("refreshMadeFrom", { orgId });
      setMsg(`結んである${r.linked}件を見直し、${r.updated}件の値段・アレルゲン・成分を入れ直しました。`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        タルト生地・クレームダマンド・りんごのキャラメリゼのように、お店で作ってほかのレシピに使う材料です。作るレシピに結ぶと、
        値段（材料の合計÷重さ）・アレルゲン（中身の材料の分）・成分（中身の成分表から100gあたり）がレシピから入り、gで計算できるようになります。
        レシピに材料が無いときは、レシピの画面の「このレシピを材料として使う」から作れます。
      </p>
      {!rows.length && !hinted.length && <p className="text-sm text-muted">新しく結ぶ材料はありません。</p>}
      {rows.length > 0 && (
        <>
          <ul className="divide-y divide-line">
            {rows.map(({ ing, recipe, partial }) => {
              const p = madeFromPatch(recipe.items, ingById);
              const off = skip.has(ing.id);
              return (
                <li key={ing.id} className={`space-y-0.5 py-2 text-sm ${off ? "opacity-50" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate"><b>{ing.name}</b> ← レシピ「<Link to={`/recipes/${recipe.id}`} className="text-clay-strong underline">{recipe.name}</Link>」{partial && <span className="ml-1 text-[11px] text-warn-strong">名前の一部が同じ</span>}</span>
                    <button type="button" className="shrink-0 text-xs text-muted underline" onClick={() => setSkip((s) => { const n = new Set(s); if (n.has(ing.id)) n.delete(ing.id); else n.add(ing.id); return n; })}>{off ? "戻す" : "結ばない"}</button>
                  </div>
                  <p className="text-xs text-muted">
                    {p.purchasePrice === null ? `値段はまだ出ません（中身の${p.missing}行に値段か重さが無い）` : `${p.purchaseQty.toLocaleString("ja-JP")}gで${yen(p.purchasePrice)}`}
                    ／アレルゲン：{p.allergens.length ? p.allergens.map(allergenName).join("・") : "なし"}
                  </p>
                </li>
              );
            })}
          </ul>
          <button disabled={busy} onClick={linkAll} className={`w-full ${ui.primary}`}>{busy ? "結んでいます…" : `${rows.length - skip.size}件をレシピに結ぶ`}</button>
        </>
      )}
      {hinted.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted">お店で作っていそうな材料（同じ名前のレシピが無いもの）。作るレシピがあれば、開いて選んでください。</p>
          <div className="flex flex-wrap gap-1.5">
            {hinted.slice(0, 30).map((i) => <Link key={i.id} to={`/ingredients?open=${i.id}`} className={`${ui.chip} text-clay-strong`}>{i.name}</Link>)}
          </div>
        </div>
      )}
      {linked > 0 && (
        <button type="button" disabled={busy} onClick={refresh} className={`w-full ${ui.secondary} text-sm`}>結んである{linked}件の値段・アレルゲン・成分を入れ直す</button>
      )}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
