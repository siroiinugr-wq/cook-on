// 画面上部のクレジット残高。押すとクレジットの画面へ
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

/** link：クレジットの画面へとべるか（スタッフは画面に入れないので、残りだけ見せる） */
export function CreditBadge({ credits, link = true }: { credits: number; link?: boolean }) {
  const cls = "flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-1 text-sm";
  const inner = <><span className="text-clay"><Icon name="coin" className="h-4 w-4" /></span><span className="font-bold">{creditText(credits)}</span></>;
  return link
    ? <Link to="/credits" className={cls} aria-label={`クレジット残り${creditText(credits)}`}>{inner}</Link>
    : <span className={cls} aria-label={`クレジット残り${creditText(credits)}`}>{inner}</span>;
}

/** AIボタンに添える「1クレジット」の小さな表示 */
export function CostTag({ credits }: { credits: number }) {
  return <span className="ml-1 rounded-full bg-clay-soft px-1.5 py-0.5 text-[11px] font-bold text-clay-strong">{credits}クレジット</span>;
}

/** 残高の表示。無制限の店舗（Infinity）は「無制限」 */
export function creditText(credits: number): string {
  return credits === Infinity ? "無制限" : String(credits);
}
