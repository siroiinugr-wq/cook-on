// これまでの取り込みの一覧。選んで（まとめて）消せる（同じファイルを何度も取り込んだときの片付け）。
// 消すと取り込みの記録が無くなり、その取り込みで作ったレシピはしまう（消さない。「しまったレシピを見る」から戻せる）。
// 手で直したレシピ（第2版以降）は既定で残す。材料の仕入れ値・アレルゲン・別名はレシピと別なので残る（functions の removeImports）
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ImportDoc } from "@shared/importTypes";
import { call, toDate, type WithId } from "../../lib/store";
import { useConfirm } from "../common/ConfirmDialog";
import { ui } from "../common/ui";

const STATUS: Record<string, string> = { parsing: "読み取り中", preview: "確認待ち", saving: "保存中", saved: "保存済み", failed: "失敗" };

export function PastImports({ orgId, list, canEdit }: { orgId: string; list: WithId<ImportDoc>[]; canEdit: boolean }) {
  const confirm = useConfirm();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [keepEdited, setKeepEdited] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 同じファイル名の取り込み（新しい順に並んでいるので、2つめ以降が古い重複）
  const olderDups = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of list) {
      const key = p.fileName?.trim();
      if (!key) continue;
      if (seen.has(key)) out.push(p.id);
      else seen.add(key);
    }
    return out;
  }, [list]);
  const dupCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of list) if (p.fileName?.trim()) m.set(p.fileName.trim(), (m.get(p.fileName.trim()) ?? 0) + 1);
    return m;
  }, [list]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = list.filter((p) => sel.has(p.id));
  const recipes = chosen.reduce((t, p) => t + (p.savedRecipeIds?.length ?? 0), 0);

  async function remove() {
    const ok = await confirm({
      title: `取り込み${chosen.length}件を消しますか？`,
      body: `${recipes ? `この取り込みで作ったレシピ${recipes}件は一覧からしまいます（消えません。「しまったレシピを見る」から1件ずつ戻せます）。${keepEdited ? "取り込んだあとに手で直したレシピは残します。" : "手で直したレシピもしまいます。"}` : ""}材料の仕入れ値・アレルゲン・別名はそのまま残ります。`,
      ok: "消す",
    });
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ removed: number; busy: number; archived: number; kept: number }>("removeImports", { orgId, importIds: chosen.map((p) => p.id), keepEdited });
      setSel(new Set());
      setMsg([
        `取り込み${r.removed}件を消しました。`,
        r.archived ? `レシピ${r.archived}件をしまいました。` : "",
        r.kept ? `手で直したレシピ${r.kept}件は残しました。` : "",
        r.busy ? `読み取り中・保存中の${r.busy}件は消していません（終わってからもう一度）。` : "",
      ].join(""));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!list.length) return msg ? <p className="text-sm text-ink-soft">{msg}</p> : null;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="flex-1 text-sm font-bold">これまでの取り込み</h2>
        {canEdit && olderDups.length > 0 && (
          <button type="button" className="text-xs text-clay-strong underline" onClick={() => setSel(new Set(olderDups))}>同じファイルの古い取り込み（{olderDups.length}件）を選ぶ</button>
        )}
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-paper">
        {list.map((p) => {
          const dup = (dupCount.get(p.fileName?.trim() ?? "") ?? 0) > 1;
          return (
            <li key={p.id} className="flex items-center gap-2 pl-3">
              {canEdit && <input type="checkbox" aria-label="選ぶ" className="h-4 w-4 shrink-0" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />}
              <Link to={`/import/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-4 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {p.fileName || "貼り付け"}<span className="ml-2 text-xs text-muted">{toDate(p.createdAt)?.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  {dup && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn-strong">同じファイル</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{p.recipes?.length ?? 0}件・{STATUS[p.status] ?? p.status}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button type="button" className="text-muted underline" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((p) => p.id)))}>
              {sel.size === list.length ? "選ぶのをやめる" : "すべて選ぶ"}
            </button>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={keepEdited} onChange={(e) => setKeepEdited(e.target.checked)} />取り込んだあとに手で直したレシピは残す（外すと、手で直したレシピもしまう）</label>
          </div>
          {chosen.length > 0 && (
            <button disabled={busy} onClick={remove} className={`w-full ${ui.secondary}`}>
              {busy ? "消しています…" : `選んだ取り込み${chosen.length}件を消す${recipes ? `（レシピ${recipes}件をしまう）` : ""}`}
            </button>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </section>
  );
}
