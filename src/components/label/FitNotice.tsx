// ラベルに入りきらないときのお知らせ。字はもう下限（5.5pt など）まで縮めてあるので、用紙を変えるか文を短くするかを案内する
import { LABEL_PAPERS } from "@shared/label";
import type { LabelData } from "../../lib/labelBuild";
import { papersThatFit, type LabelFit } from "../../lib/labelImage";

export function FitNotice({ d, w, h, fit, onPaper }: { d: LabelData; w: number; h: number; fit: LabelFit; onPaper?: (id: string) => void }) {
  if (fit.fits) return null;
  const ok = papersThatFit(d, LABEL_PAPERS);
  return (
    <div className="space-y-1.5 rounded-xl bg-ng/10 p-3 text-sm text-ng">
      <p className="font-bold">このラベル用紙（{w}×{h}mm）に入りきらず、下が約{Math.ceil(fit.needH - h)}mm切れます。</p>
      <p className="text-xs">字はもう表示の決まりの下限（{fit.minPt}pt）まで小さくしています。次のどれかで直せます。</p>
      <ul className="list-disc space-y-0.5 pl-5 text-xs">
        <li>大きい用紙にする{ok.length > 0 && "："}
          {ok.map((p) => onPaper
            ? <button key={p.id} className="mx-1 underline" onClick={() => onPaper(p.id)}>{p.name}</button>
            : <span key={p.id} className="mx-1">{p.name}</span>)}
          {onPaper && <button className="mx-1 underline" onClick={() => onPaper(`custom:${w}x${Math.ceil(fit.needH)}`)}>自由な大きさ {w}×{Math.ceil(fit.needH)}mm</button>}
        </li>
        <li>原材料名・保存方法などの文を短くする</li>
        <li>画像で書き出すときは「下に伸ばして保存」を選ぶ（{w}×{Math.ceil(fit.needH)}mm の画像になります）</li>
      </ul>
    </div>
  );
}
