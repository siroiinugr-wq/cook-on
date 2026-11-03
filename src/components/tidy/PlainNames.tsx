// 成分表の名前のまま登録された材料（「（キャベツ類） キャベツ 結球葉 生」など）を、読みやすい名前に直す。元の名前は別名に残す（無料）
import { useState } from "react";
import { plainFoodName } from "@shared/mext";
import type { Ingredient } from "@shared/types";
import { saveDoc } from "../../lib/store";
import { ui } from "../common/ui";

export function PlainNames({ orgId, list }: { orgId: string; list: Ingredient[] }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!list.length) return <p className="text-sm text-muted">ありません。</p>;
  const nameOf = (i: Ingredient) => vals[i.id] ?? plainFoodName(i.name);

  async function save() {
    setBusy(true);
    setMsg("");
    let done = 0;
    try {
      for (const i of list) {
        const name = nameOf(i).trim().slice(0, 60);
        if (!name || name === i.name) continue;
        const aliases = [...new Set([...(i.aliases ?? []), i.name.slice(0, 60)])].filter((a) => a !== name).slice(-20);
        await saveDoc(`organizations/${orgId}/ingredients/${i.id}`, { name, aliases });
        done++;
      }
      setMsg(`${done}件の名前を直しました（元の名前は別名に残したので、取り込みでも結びつきます）。`);
    } catch {
      setMsg(`${done}件まで直しました。もう一度お試しください。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">レシートから「新しく登録」したとき、成分表の名前のままになった材料です。お店の呼び方に直してください（成分表の成分・アレルゲンとの結びつきはそのままです）。</p>
      <ul className="divide-y divide-line">
        {list.map((i) => (
          <li key={i.id} className="space-y-1 py-2">
            <p className="truncate text-xs text-muted">{i.name}</p>
            <input className={ui.input} value={nameOf(i)} maxLength={60} onChange={(e) => setVals((v) => ({ ...v, [i.id]: e.target.value }))} />
          </li>
        ))}
      </ul>
      <button disabled={busy} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "直しています…" : "この名前に直す"}</button>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
