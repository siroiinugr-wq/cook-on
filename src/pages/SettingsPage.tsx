// 設定：上に目次（押すとその欄へ）→ ほかの画面への入口 → お店・ラベル／AI経理と連携／ブランド／メンバー／店舗の切り替え。
// ほかの画面からは「/settings#store」のように欄を指定してとべる
import { Link } from "react-router-dom";
import type { Branding } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useDoc } from "../hooks/useData";
import { isDemo } from "../lib/firebase";
import { resetDemo } from "../lib/demo";
import { PageHead } from "../components/common/Layout";
import { useConfirm } from "../components/common/ConfirmDialog";
import { Icon, type IconName } from "../components/common/Icon";
import { ui } from "../components/common/ui";
import { BrandSection } from "../components/settings/BrandSection";
import { MembersSection } from "../components/settings/MembersSection";
import { StoreSection } from "../components/settings/StoreSection";
import { StoresSection } from "../components/settings/StoresSection";
import { KeiriLinkSection } from "../components/settings/KeiriLinkSection";
import { NicknameSection } from "../components/settings/NicknameSection";
import { creditText } from "../components/common/CreditBadge";
import { useHashScroll } from "../hooks/useHashScroll";

export function SettingsPage({ brand }: { brand: Branding }) {
  const { orgId, org, orgs, email, select, isAdmin, uid } = useOrgCtx();
  // 運営（operators/{uid} がある人）だけに、共有の材料の精査を出す
  const op = useDoc(`operators/${uid}`);
  const confirm = useConfirm();
  useHashScroll();
  const toc = [
    { id: "me", label: "ニックネーム" },
    { id: "store", label: "お店・ラベル" },
    ...(isAdmin ? [{ id: "keiri", label: "AI経理と連携" }, { id: "brand", label: "ブランド" }] : []),
    { id: "members", label: "メンバー" },
    { id: "stores", label: "店舗の切り替え" },
  ];
  const links: { to: string; icon: IconName; title: string; sub: string }[] = [
    { to: "/credits", icon: "coin", title: `クレジット（残り ${creditText(org.credits)}）`, sub: "使った記録・まとめ買い" },
    { to: "/import", icon: "upload", title: "データの取り込み", sub: "ほかのアプリや Excel から引っ越す" },
    { to: "/labels", icon: "printer", title: "ラベルをまとめて印刷", sub: "いくつもの商品を1回で・詰め合わせ（ギフト・コーヒー豆）のラベル" },
    { to: "/tidy", icon: "sparkle", title: "データの整理", sub: "アレルゲンの確認・仕入れ値・何個分・名前・表記ゆれをまとめて見直す" },
    { to: "/todo", icon: "check", title: "やること・AIでできること", sub: "いま片付けたいことと、AIの機能の一覧" },
    ...(op.data ? [{ to: "/admin/suggestions", icon: "check" as IconName, title: "運営：共有の材料の精査", sub: "お店の提案とAIの推定価格を、採用・却下する" }] : []),
  ];

  async function reset() {
    if (await confirm({ title: "デモのデータを最初に戻しますか？", body: "試しに作ったレシピや材料は消えます。", ok: "最初に戻す" })) resetDemo();
  }

  return (
    <div className="space-y-4">
      <PageHead title="設定" />
      <nav className="flex flex-wrap gap-1.5 text-sm">
        {toc.map((t) => <a key={t.id} href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={ui.chip}>{t.label}</a>)}
      </nav>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-3">
            <span className="text-clay"><Icon name={l.icon} /></span>
            <span className="flex-1"><span className="block font-medium">{l.title}</span><span className="block text-xs text-muted">{l.sub}</span></span>
            <Icon name="chevron" className="h-4 w-4 text-faint" />
          </Link>
        ))}
      </div>
      <div id="me" className="scroll-mt-20"><NicknameSection /></div>
      <div id="store" className="scroll-mt-20"><StoreSection orgId={orgId} org={org} canManage={isAdmin} /></div>
      {isAdmin && <div id="keiri" className="scroll-mt-20"><KeiriLinkSection orgId={orgId} org={org} /></div>}
      {isAdmin && <div id="brand" className="scroll-mt-20"><BrandSection key={JSON.stringify(brand)} orgId={orgId} brand={brand} /></div>}
      <div id="members" className="scroll-mt-20"><MembersSection orgId={orgId} canManage={isAdmin && !isDemo} /></div>
      <div id="stores" className="scroll-mt-20"><StoresSection orgs={orgs} current={orgId} email={email} onSelect={select} /></div>
      {isDemo && <button onClick={reset} className={`w-full ${ui.secondary}`}>デモのデータを最初に戻す</button>}
      <p className="pb-4 text-center text-xs text-muted">画面の版 {__BUILD_TIME__}</p>
    </div>
  );
}
