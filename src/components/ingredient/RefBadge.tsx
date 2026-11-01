// 仕入れ値が「参考価格」（共有の材料の目安）のときに出す小さな印
export function RefBadge({ className = "" }: { className?: string }) {
  return <span className={`inline-block rounded bg-warn-soft px-1 text-[10px] font-bold text-warn-strong ${className}`}>参考価格</span>;
}
