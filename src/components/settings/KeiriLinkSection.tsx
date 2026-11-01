// AI経理（別のアプリ）と自動でつなぐ：連携コードを作って AI経理の設定に貼ると、承認したレシートの明細が自動で届く（管理者だけ）。
// 届いた明細は「レシート・納品書から仕入れ値」に並び、確かめてから仕入れ値に反映する
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Org } from "../../hooks/useOrg";
import { call } from "../../lib/store";
import { ui } from "../common/ui";

const KEIRI_URL = "https://keiri.iwakuni-design.com";
const when = (d: Date | null) => (d ? d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "まだ");

export function KeiriLinkSection({ orgId, org }: { orgId: string; org: Org }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const link = org.keiriLink;

  async function make() {
    if (link && !confirm("コードを作り直すと、前のコードは使えなくなります。AI経理の設定にも新しいコードを貼り直してください。")) return;
    setBusy(true);
    setMsg("");
    try {
      setCode((await call<{ code: string }>("createLinkCode", { orgId })).code);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!confirm("AI経理との連携をやめますか？ AI経理から送られてきても受け取らなくなります。")) return;
    setBusy(true);
    try {
      await call("revokeLinkCode", { orgId });
      setCode("");
      setMsg("連携をやめました。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${ui.card} space-y-2`}>
      <h2 className="font-bold">AI経理と連携</h2>
      <p className="text-sm text-ink-soft">
        経理アプリ「<a href={KEIRI_URL} target="_blank" rel="noreferrer" className="underline">AI経理</a>」（別のアプリ）を使っているお店は、つないでおくと、レシートを承認するたびに明細が COOK ON に届きます。
        届いた明細は<Link to="/ingredients/invoices" className="underline">レシート・納品書から仕入れ値</Link>に並び、確かめてから仕入れ値に反映します。
      </p>
      {link && (
        <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm">
          つながっています{link.sender ? `（${link.sender}）` : ""}。最後に届いたのは {when(link.lastAt)}・これまで{link.count}行
        </p>
      )}
      {code && (
        <div className="space-y-1 rounded-xl border border-clay p-3">
          <p className="text-sm font-bold">連携コード（この画面を閉じると二度と出ません）</p>
          <p className="select-all break-all rounded-lg bg-sand px-2 py-1.5 font-mono text-xs">{code}</p>
          <button type="button" className="text-sm underline" onClick={() => navigator.clipboard?.writeText(code).then(() => setMsg("コピーしました。"))}>コピーする</button>
          <p className="text-xs text-muted">AI経理の「設定 → COOK ON と連携」に貼ってください。人に見せないでください（このコードがあれば明細を送れます）。</p>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={make} className={`flex-1 ${ui.secondary}`}>{link ? "コードを作り直す" : "連携コードを作る"}</button>
        {link && <button type="button" disabled={busy} onClick={stop} className={ui.secondary}>連携をやめる</button>}
      </div>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </section>
  );
}
