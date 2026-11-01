// 画面の枠：上に店舗名とクレジット、下に5つの入口（スマホで片手で押せる位置）
// レシピ／材料（包装・既製品も）／仕入れ（レシート・AI経理）／やること（お知らせ・AIでできること・取り込み・整理）／設定
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTodo } from "../../hooks/useTodo";
import type { Branding } from "@shared/types";
import { useOrgCtx } from "../../contexts/OrgContext";
import { isDemo } from "../../lib/firebase";
import { brandLogo } from "../../hooks/useBranding";
import { CreditBadge } from "./CreditBadge";
import { Icon, type IconName } from "./Icon";

type Tab = "recipes" | "materials" | "buy" | "todo" | "settings";
const NAV: { tab: Tab; to: string; label: string; icon: IconName }[] = [
  { tab: "recipes", to: "/", label: "レシピ", icon: "book" },
  { tab: "materials", to: "/ingredients", label: "材料", icon: "scale" },
  { tab: "buy", to: "/ingredients/invoices", label: "仕入れ", icon: "receipt" },
  { tab: "todo", to: "/todo", label: "やること", icon: "sparkle" },
  { tab: "settings", to: "/settings", label: "設定", icon: "settings" },
];

/** いまの画面がどの入口の中か（材料の中の包装・既製品も「材料」を光らせる） */
export function tabOf(path: string): Tab {
  if (path.startsWith("/ingredients/invoices")) return "buy";
  if (/^\/(ingredients|packaging|products)/.test(path)) return "materials";
  if (/^\/(todo|import|tidy)/.test(path)) return "todo";
  if (/^\/(settings|credits|admin)/.test(path)) return "settings";
  return "recipes";
}

export function Layout({ brand, children }: { brand: Branding; children: ReactNode }) {
  const { org } = useOrgCtx();
  const todo = useTodo();
  const here = tabOf(useLocation().pathname);
  const badge: Partial<Record<Tab, number>> = { buy: todo.inbox, todo: todo.badge };
  return (
    <div className="min-h-screen pb-24">
      {isDemo && (
        <p className="no-print bg-warn-soft px-4 py-1.5 text-center text-xs text-warn-strong">
          デモモード：サンプルのデータで動いています（AIは簡易版）。Firebase をつなぐと本番になります。
        </p>
      )}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {brandLogo(brand)
            ? <img src={brandLogo(brand)!} alt={brand.appName} className="h-8 w-8 rounded-lg object-contain" />
            : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay text-white"><Icon name="bowl" className="h-5 w-5" /></span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-faint">{brand.appName}</p>
            <p className="truncate font-bold leading-tight">{org.name || "　"}</p>
          </div>
          <CreditBadge credits={org.credits} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} aria-current={here === n.tab ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${here === n.tab ? "font-bold text-clay-strong" : "text-muted"}`}>
              <Icon name={n.icon} className="h-6 w-6" />
              {n.label}
              {!!badge[n.tab] && <span className="absolute left-1/2 top-1 ml-2 min-w-4 rounded-full bg-ng px-1 text-center text-[10px] font-bold leading-4 text-white">{badge[n.tab]}</span>}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** 画面の見出し（左に戻る、右に主役の操作） */
export function PageHead({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <div className="no-print mb-4 flex items-center gap-2">
      {back && <NavLink to={back} className="-ml-2 rounded-lg p-1.5 text-muted" aria-label="戻る"><Icon name="back" /></NavLink>}
      <h1 className="flex-1 font-serif text-2xl">{title}</h1>
      {right}
    </div>
  );
}
