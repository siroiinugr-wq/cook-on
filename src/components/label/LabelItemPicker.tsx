// まとめて印刷・詰め合わせに品目を足す欄。レシピが多くても探せるように、打って探す（名前・分類・種類・タグ）。
// 詰め合わせでは、保存したレシピの無い品目（コーヒー豆など。labelItems）も同じ欄で探せる
import { useMemo, useState } from "react";
import { toMatchKey } from "@shared/matchKey";
import type { Recipe } from "@shared/types";
import { Icon } from "../common/Icon";

/** 保存したレシピの無い品目 organizations/{orgId}/labelItems/{id} */
export interface LabelItem { id: string; name: string; text: string; content?: string }

const key = (s: string) => toMatchKey(s);
const LIMIT = 40;

export function LabelItemPicker({ recipes, items, onRecipe, onItem, onDropItem, onFree }: {
  recipes: Recipe[];
  /** 詰め合わせのときだけ渡す */
  items?: LabelItem[];
  onRecipe: (r: Recipe) => void;
  onItem?: (i: LabelItem) => void;
  onDropItem?: (i: LabelItem) => void;
  /** 新しくレシピの無い品目を足す（打った名前で始める） */
  onFree?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const k = key(q);
  const raw = q.trim().toLowerCase();
  const hits = useMemo(() => {
    const has = (s: string | undefined) => !!s && (key(s).includes(k) || s.toLowerCase().includes(raw));
    const r = recipes.filter((x) => !raw || has(x.name) || has(x.category) || has(x.subcategory) || (x.tags ?? []).some(has));
    // 名前で当たったものを先に
    r.sort((a, b) => Number(!has(a.name)) - Number(!has(b.name)));
    const it = (items ?? []).filter((x) => !raw || has(x.name) || has(x.text));
    return { r, it };
  }, [recipes, items, k, raw]);

  if (!open) {
    return (
      <button type="button" onClick={() => { setQ(""); setOpen(true); }} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper px-3 py-2 text-left text-sm text-clay-strong">
        <Icon name="plus" className="h-4 w-4" />{items ? "品目を足す（レシピ・保存した品目から探す）" : "商品（レシピ）を足す"}
      </button>
    );
  }
  const pick = (f: () => void) => { f(); setQ(""); };
  const row = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sand";
  return (
    <div className="rounded-xl border border-line-strong bg-paper">
      <div className="relative border-b border-line p-2">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" className="h-4 w-4" /></span>
        <input autoFocus className="w-full rounded-lg border border-line-strong bg-paper py-1.5 pl-8 pr-16 text-sm" placeholder="名前・分類・タグで探す（ひらがなでも）" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="absolute right-3 top-1/2 -translate-y-1/2 px-2 text-xs text-muted underline" onClick={() => setOpen(false)}>閉じる</button>
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {items && hits.it.length > 0 && <p className="px-3 pt-1 text-[11px] font-medium text-muted">保存した品目（レシピの無いもの）</p>}
        {items && hits.it.slice(0, LIMIT).map((i) => (
          <div key={i.id} className="flex items-center">
            <button className={`${row} flex-1`} onClick={() => pick(() => onItem?.(i))}>
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">{i.content || i.text}</span>
            </button>
            {onDropItem && <button aria-label="保存した品目を消す" className="px-3 text-faint" onClick={() => onDropItem(i)}><Icon name="trash" className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
        {items && hits.r.length > 0 && <p className="px-3 pt-1 text-[11px] font-medium text-muted">レシピ</p>}
        {hits.r.slice(0, LIMIT).map((r) => (
          <button key={r.id} className={row} onClick={() => pick(() => onRecipe(r))}>
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 text-xs text-muted">{[r.category, r.subcategory].filter(Boolean).join("・")}</span>
          </button>
        ))}
        {hits.r.length > LIMIT && <p className="px-3 py-1 text-xs text-muted">ほか {hits.r.length - LIMIT} 件。名前を打ってしぼりこんでください。</p>}
        {!hits.r.length && !hits.it.length && <p className="px-3 py-2 text-sm text-muted">見つかりません。</p>}
        {onFree && (
          <button className={`${row} border-t border-line text-clay-strong`} onClick={() => pick(() => onFree(q.trim()))}>
            <Icon name="plus" className="h-4 w-4" />{q.trim() ? `「${q.trim()}」をレシピの無い品目として足す` : "レシピの無い品目（コーヒー豆・仕入れた商品など）を足す"}
          </button>
        )}
      </div>
    </div>
  );
}
