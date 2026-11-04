// 名前から添加物と見分けた材料（ベーキングパウダーなど）の書き方を選んで、材料に覚える。
// 覚えるまでも、ラベルはおすすめの書き方（膨張剤など）で「／」のあとに出している
import { useState } from "react";
import { saveDoc } from "../../lib/store";
import type { AdditiveHint } from "../../lib/labelBuild";

export function AdditiveBox({ orgId, hints, canEdit }: { orgId: string; hints: AdditiveHint[]; canEdit: boolean }) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  if (!hints.length) return null;
  const value = (h: AdditiveHint) => pick[h.ingredient.id] ?? h.current;

  async function save() {
    setMsg("");
    try {
      for (const h of hints) await saveDoc(`organizations/${orgId}/ingredients/${h.ingredient.id}`, { labelName: value(h), isAdditive: true });
      setMsg("材料に覚えました。ほかのレシピのラベルもこの書き方になります。");
    } catch {
      setMsg("覚えられませんでした。");
    }
  }

  return (
    <section className="space-y-2 rounded-xl bg-blank-soft p-3 text-sm text-ink-soft">
      <p className="font-bold">添加物の書き方</p>
      <p className="text-xs">名前から添加物と判断して、「／」のあとに正式な書き方で並べています。書き方を選んで材料に覚えると、次からどのレシピでもこの書き方になります。</p>
      <ul className="space-y-2">
        {hints.map((h) => (
          <li key={h.ingredient.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-24">{h.ingredient.name}</span>→
              <select disabled={!canEdit} className="rounded-lg border border-line-strong bg-paper px-2 py-1" value={value(h)} onChange={(e) => setPick({ ...pick, [h.ingredient.id]: e.target.value })}>
                {[...new Set([h.current, ...h.rule.options])].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted">{h.rule.note}</p>
          </li>
        ))}
      </ul>
      {canEdit && <button className="text-sm text-clay-strong underline" onClick={save}>この書き方を材料に覚える</button>}
      {msg && <p className="text-xs">{msg}</p>}
    </section>
  );
}
