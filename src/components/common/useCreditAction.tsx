// クレジットを使う操作の共通の流れ（設計書 ③「費用は先に見せる」）
// 押す → 確認ダイアログ（使う数と残り）→ 足りなければクレジットの画面へ案内 → 受付番号を付けて実行
// 費用は警告色にせず太字で伝える。断られたときの文はサーバーの日本語をそのまま出す
import { useNavigate } from "react-router-dom";
import { useConfirm } from "./ConfirmDialog";

export function useCreditAction(balance: number) {
  const confirm = useConfirm();
  const nav = useNavigate();
  return async function run<T>(o: { title: string; credits: number; detail?: string; exec: () => Promise<T> }): Promise<T | null> {
    // 無制限の店舗（残高が Infinity）はクレジットを使わないので、確認を出さずに実行する
    if (balance === Infinity) return o.exec();
    if (balance < o.credits) {
      const go = await confirm({
        title: "クレジットが足りません",
        body: `「${o.title}」には ${o.credits} クレジット必要です（残り ${balance}）。クレジットの画面で追加できます。`,
        ok: "クレジットの画面へ",
      });
      if (go) nav("/credits");
      return null;
    }
    const ok = await confirm({
      title: o.title,
      body: `${o.credits} クレジットを使います（残り ${balance} → ${balance - o.credits}）。${o.detail ?? ""}うまくいかなかったときは使われません。`,
      ok: `${o.credits} クレジットで実行`,
    });
    if (!ok) return null;
    return o.exec();
  };
}
