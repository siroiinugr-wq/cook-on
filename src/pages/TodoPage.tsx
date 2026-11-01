// やること・AI：いま片付けたいこと（お知らせ・届いたレシート・未確認のアレルゲン・空の仕入れ値）と、AIでできることの入口を1か所に。
// どの入口もほかの画面からも行ける（複数の道から同じ場所へ）。ここは「迷ったらまずここ」の画面
import { Link } from "react-router-dom";
import { CREDIT_COST, type CreditAction } from "@shared/credits";
import { useOrgCtx } from "../contexts/OrgContext";
import { useTodo, type Todo } from "../hooks/useTodo";
import { PageHead } from "../components/common/Layout";
import { Icon, type IconName } from "../components/common/Icon";
import { creditText } from "../components/common/CreditBadge";
import { ui } from "../components/common/ui";
import { CREDIT_PER } from "../lib/creditPer";

const TONE: Record<Todo["tone"], string> = {
  ng: "border-ng/30 bg-ng-soft text-ng-strong",
  warn: "border-warn/30 bg-warn-soft text-warn-strong",
  info: "border-line bg-paper text-ink",
};

const AI: { to: string; icon: IconName; title: string; sub: string; action: CreditAction; where?: string }[] = [
  { to: "/import/photos", icon: "camera", title: "写真からレシピを取り込む", sub: "ノートや本を撮ると、材料と分量を読み取る（手書きも）", action: "importPhoto" },
  { to: "/import", icon: "file", title: "ファイル・文章からレシピを取り込む", sub: "ほかのアプリのCSV・Excel・メモ", action: "importChunk" },
  { to: "/ingredients/invoices", icon: "receipt", title: "レシート・納品書から仕入れ値", sub: "明細・量・値段を読んで材料を最新に", action: "invoicePhoto" },
  { to: "/tidy#price", icon: "search", title: "仕入れ値をネットで調べて入れる", sub: "仕入れ値が空の材料に、今の販売価格を", action: "priceSearch" },
  { to: "/ingredients", icon: "coin", title: "ネットで値段を比べる", sub: "売り場と100gあたりの値段を並べる", action: "priceCompare", where: "材料を開いて" },
  { to: "/tidy#link", icon: "link", title: "共有の材料に結ぶ（AIで探す）", sub: "成分表・アレルゲン・参考価格がつく", action: "aiMatch" },
  { to: "/tidy#label", icon: "tag", title: "ラベルの名前の案", sub: "キビ糖→きび砂糖のような品質表示の名前", action: "labelName" },
  { to: "/products", icon: "box", title: "既製品のパッケージを読む", sub: "裏を撮ると原材料とアレルゲンを下書き", action: "productPhoto" },
  { to: "/", icon: "chat", title: "AIに相談", sub: "原価を下げる案・新しい商品の案", action: "aiSuggest", where: "レシピを開いて" },
];

export function TodoPage() {
  const { org, canEdit } = useOrgCtx();
  const todo = useTodo();
  return (
    <div className="space-y-5 pb-6">
      <PageHead title="やること・AI" />

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink-soft">いまやること</h2>
        {todo.loading ? <p className="text-sm text-muted">読み込み中…</p> : !todo.list.length ? (
          <p className={`${ui.card} flex items-center gap-2 text-sm`}><span className="text-ok"><Icon name="check" /></span>今は片付けることはありません。</p>
        ) : todo.list.map((t) => (
          <Link key={t.key} to={t.to} className={`flex items-center gap-3 rounded-2xl border p-3 ${TONE[t.tone]}`}>
            <span className="min-w-0 flex-1"><b className="block text-sm">{t.title}</b><span className="block text-xs opacity-80">{t.sub}</span></span>
            <Icon name="chevron" className="h-4 w-4 shrink-0" />
          </Link>
        ))}
      </section>

      {canEdit && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="flex-1 text-sm font-bold text-ink-soft">AIでできること</h2>
            <Link to="/credits" className="text-xs text-clay-strong underline">残り {creditText(org.credits)} クレジット</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {AI.map((a) => (
              <Link key={a.title} to={a.to} className={`${ui.card} flex items-start gap-3 py-3`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-clay-soft text-clay-strong"><Icon name={a.icon} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{a.title}</b>
                  <span className="block text-xs text-muted">{a.sub}</span>
                  <span className="mt-1 block text-[11px] text-clay-strong">{CREDIT_PER[a.action]} {CREDIT_COST[a.action]}クレジット{a.where ? `・${a.where}` : ""}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {canEdit && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-ink-soft">無料で整える</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
            <Row to="/tidy" icon="sparkle" title="データの整理" sub="アレルゲン・仕入れ値・何個分・名前・表記ゆれを上から順に" />
            <Row to="/recipes/new" icon="plus" title="新しいレシピを作る" sub="分類から似たレシピをコピーして始められます" />
            <Row to="/packaging" icon="tag" title="包装資材とセット" sub="袋・脱酸素剤の値段を1個あたりの原価に" />
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ to, icon, title, sub }: { to: string; icon: IconName; title: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3">
      <span className="text-clay"><Icon name={icon} /></span>
      <span className="min-w-0 flex-1"><b className="block text-sm font-medium">{title}</b><span className="block text-xs text-muted">{sub}</span></span>
      <Icon name="chevron" className="h-4 w-4 text-faint" />
    </Link>
  );
}
