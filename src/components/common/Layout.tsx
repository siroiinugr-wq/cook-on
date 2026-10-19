// 画面の枠：上に店舗名とクレジット、下に4つの入口（スマホで片手で押せる位置）
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { Branding } from "@shared/types";
import { useOrgCtx } from "../../contexts/OrgContext";
import { isDemo } from "../../lib/firebase";
import { CreditBadge } from "./CreditBadge";
import { Icon, type IconName } from "./Icon";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "レシピ", icon: "book" },
  { to: "/ingredients", label: "材料", icon: "box" },
  { to: "/import", label: "取り込み", icon: "upload" },
  { to: "/settings", label: "設定", icon: "settings" },
];

export function Layout({ brand, children }: { brand: Branding; children: ReactNode }) {
  const { org } = useOrgCtx();
  return (
    <div className="min-h-screen pb-24">
      {isDemo && (
        <p className="no-print bg-warn-soft px-4 py-1.5 text-center text-xs text-warn-strong">
          デモモード：サンプルのデータで動いています（AIは簡易版）。Firebase をつなぐと本番になります。
        </p>
      )}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt={brand.appName} className="h-8 w-8 rounded-lg object-contain" />
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
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isActive ? "font-bold text-clay-strong" : "text-muted"}`}>
              <Icon name={n.icon} className="h-6 w-6" />
              {n.label}
            </NavLink>
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
