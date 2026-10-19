// 原価率の小さな表示。目標以内は緑、超えたら赤。売価が無ければ「売価未定」
import { percent } from "@shared/cost";

export function RateBadge({ rate, target }: { rate: number | null; target: number }) {
  if (rate === null) return <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">売価未定</span>;
  const over = rate > target;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${over ? "bg-ng-soft text-ng-strong" : "bg-ok-soft text-ok-strong"}`}>
      原価率 {percent(rate)}{over ? "（目標超え）" : ""}
    </span>
  );
}
