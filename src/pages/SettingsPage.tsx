// 設定：お店・ブランド・メンバー・店舗の切り替え。クレジットと既製品への入口もここ
import { Link } from "react-router-dom";
import type { Branding } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
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

export function SettingsPage({ brand }: { brand: Branding }) {
  const { orgId, org, orgs, email, select, isAdmin } = useOrgCtx();
  const confirm = useConfirm();
  const links: { to: string; icon: IconName; title: string; sub: string }[] = [
    { to: "/credits", icon: "coin", title: `クレジット（残り ${org.credits}）`, sub: "使った記録・まとめ買い" },
    { to: "/products", icon: "box", title: "既製品", sub: "メーカーの商品の原材料をお店どうしで共有" },
    { to: "/import", icon: "upload", title: "データの取り込み", sub: "ほかのアプリや Excel から引っ越す" },
  ];

  async function reset() {
    if (await confirm({ title: "デモのデータを最初に戻しますか？", body: "試しに作ったレシピや材料は消えます。", ok: "最初に戻す" })) resetDemo();
  }

  return (
    <div className="space-y-4">
      <PageHead title="設定" />
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-3">
            <span className="text-clay"><Icon name={l.icon} /></span>
            <span className="flex-1"><span className="block font-medium">{l.title}</span><span className="block text-xs text-muted">{l.sub}</span></span>
            <Icon name="chevron" className="h-4 w-4 text-faint" />
          </Link>
        ))}
      </div>
      <StoreSection orgId={orgId} org={org} canManage={isAdmin} />
      {isAdmin && <BrandSection key={JSON.stringify(brand)} orgId={orgId} brand={brand} />}
      <MembersSection orgId={orgId} canManage={isAdmin && !isDemo} />
      <StoresSection orgs={orgs} current={orgId} email={email} onSelect={select} />
      {isDemo && <button onClick={reset} className={`w-full ${ui.secondary}`}>デモのデータを最初に戻す</button>}
      <p className="pb-4 text-center text-xs text-muted">画面の版 {__BUILD_TIME__}</p>
    </div>
  );
}
