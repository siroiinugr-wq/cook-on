// アレルゲンの確認：まだ確かめていない材料に、名前から推定した候補を付けて並べ、まとめて確定する
import { useEffect, useMemo, useState } from "react";
import { ALLERGENS, allergenName, sortAllergens, type AllergenId } from "@shared/allergens";
import { categorySuspect, dropCategoryHits, needsPackageCheck, suggestAllergens } from "@shared/allergenGuess";
import { Link } from "react-router-dom";
import type { Ingredient } from "@shared/types";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

const PAGE = 30;

export function AllergenReview({ orgId, list, usedIn }: { orgId: string; list: Ingredient[]; usedIn: Map<string, number> }) {
  const page = useMemo(() => list.slice(0, PAGE), [list]);
  const [picked, setPicked] = useState<Record<string, AllergenId[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 初めて出た材料には、いまの値＋推定を入れておく（押して外せる）
  useEffect(() => {
    setPicked((cur) => {
      const next = { ...cur };
      for (const i of page) {
        if (next[i.id]) continue;
        const names = [i.name, i.labelName ?? ""];
        // 成分表に結んだ材料は、分類の見出し（＜えび・かに類＞など）から誤って付いたものを外しておく
        const cur = i.globalRef?.startsWith("mext_") ? dropCategoryHits(i.allergens ?? [], names) : i.allergens ?? [];
        next[i.id] = suggestAllergens(cur, names.join(" "));
      }
      return next;
    });
  }, [page]);

  if (!list.length) return <p className="text-sm text-muted">すべての材料のアレルゲンを確かめました。</p>;

  const toggle = (id: string, a: AllergenId) => setPicked((p) => {
    const cur = p[id] ?? [];
    return { ...p, [id]: sortAllergens(cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]) };
  });

  async function confirmAll() {
    setBusy(true);
    setMsg("");
    try {
      for (const i of page) {
        await saveDoc(`organizations/${orgId}/ingredients/${i.id}`, { allergens: picked[i.id] ?? i.allergens ?? [], allergensConfirmed: true });
      }
      setMsg(`${page.length}件を確定しました。使っているレシピのアレルゲンも計算し直します。`);
    } catch {
      setMsg("保存できなかった材料があります。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        名前から推定した候補を付けています（多めに付く向き）。既製品は袋の表示を見て直してください。
        「なし」でよい材料（砂糖・塩など）は何も付いていないまま確定します。
      </p>
      <ul className="divide-y divide-line">
        {page.map((i) => {
          const cur = picked[i.id] ?? [];
          return (
            <li key={i.id} className="space-y-1.5 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                {i.allergensConfirmed === true && categorySuspect(i) && <span className="shrink-0 rounded bg-warn-soft px-1.5 text-[11px] text-warn-strong">見直し</span>}
                <span className="shrink-0 text-xs text-muted">レシピ{usedIn.get(i.id) ?? 0}件</span>
              </div>
              {needsPackageCheck(`${i.name} ${i.labelName ?? ""}`) && (
                <p className="text-xs text-warn-strong">既製品です。名前だけでは中身が分からないので、袋の裏の原材料・アレルゲンの表示で確かめてください。
                  <Link to={`/ingredients?open=${i.id}`} className="ml-1 underline">裏を撮ってAIに読ませる</Link></p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {cur.length ? cur.map((a) => (
                  <button key={a} onClick={() => toggle(i.id, a)} className="rounded-full border border-clay bg-clay-soft px-2.5 py-1 text-xs font-bold text-clay-strong">{allergenName(a)} ×</button>
                )) : <span className="text-xs text-muted">アレルゲンなし</span>}
                <button onClick={() => setOpen(open === i.id ? null : i.id)} className="text-xs text-clay-strong underline">{open === i.id ? "閉じる" : "＋ 足す"}</button>
              </div>
              {open === i.id && (
                <div className="flex flex-wrap gap-1.5 rounded-xl bg-sand p-2">
                  {ALLERGENS.map((a) => (
                    <button key={a.id} onClick={() => toggle(i.id, a.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${cur.includes(a.id) ? "border-clay bg-clay-soft font-bold text-clay-strong" : a.required ? "border-line-strong bg-paper" : "border-line bg-paper text-muted"}`}>{a.name}</button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button disabled={busy} onClick={confirmAll} className={`w-full ${ui.primary}`}>
        {busy ? "確定しています…" : `表示中の${page.length}件をこの内容で確定する`}
      </button>
      {list.length > PAGE && <p className="text-center text-xs text-muted">残り{list.length - PAGE}件は、確定すると次に出ます。</p>}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
