// 所属している店舗の切り替え・店舗の追加・ログアウト（複数の店舗を持つ人のため）
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { ROLE_LABEL } from "@shared/roles";
import type { Role } from "@shared/types";
import { auth, isDemo } from "../../lib/firebase";
import { getOnce } from "../../lib/store";
import { Icon } from "../common/Icon";
import { ui } from "../common/ui";

export function StoresSection({ orgs, current, email, onSelect }: { orgs: Record<string, Role>; current: string; email: string | null; onSelect: (id: string) => void }) {
  const ids = Object.keys(orgs).sort();
  const [names, setNames] = useState<Record<string, string>>({});
  const key = ids.join(",");
  useEffect(() => {
    Promise.all(key.split(",").map(async (id) => [id, (await getOnce<{ name: string }>(`organizations/${id}`).catch(() => null))?.name ?? "（読めません）"] as const))
      .then((pairs) => setNames(Object.fromEntries(pairs)));
  }, [key]);

  return (
    <section className={`${ui.card} space-y-2`}>
      <h2 className="font-bold">店舗とアカウント</h2>
      <p className="text-xs text-muted">{email}</p>
      <ul className="divide-y divide-line">
        {ids.map((id) => (
          <li key={id}>
            <button onClick={() => onSelect(id)} className="flex w-full items-center gap-2 py-2.5 text-left">
              <span className="flex-1 truncate">{names[id] ?? "…"}</span>
              <span className="text-xs text-muted">{ROLE_LABEL[orgs[id]]}</span>
              {id === current && <span className="text-clay"><Icon name="check" className="h-4 w-4" /></span>}
            </button>
          </li>
        ))}
      </ul>
      {!isDemo && <Link to="/new-store" className="block text-sm text-clay-strong underline">＋ 店舗を追加する</Link>}
      {!isDemo && <button onClick={() => auth && signOut(auth)} className={`${ui.quiet} px-0`}>ログアウト</button>}
    </section>
  );
}
