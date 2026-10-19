// データの取り込み（ほかのアプリや Excel からの引っ越し）。
// ファイルを選ぶ／貼る → 使うクレジットを先に見せる → AIが読み取る → プレビュー（ImportPreviewPage）で確かめて保存
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IMPORT_CHUNK_CHARS, IMPORT_MAX_CHARS, importCredits } from "@shared/credits";
import type { ImportDoc } from "@shared/importTypes";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { ACCEPT, fileToText } from "../lib/importFile";
import { call, newRequestId, toDate } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { CostTag } from "../components/common/CreditBadge";
import { Icon } from "../components/common/Icon";
import { useCreditAction } from "../components/common/useCreditAction";
import { ui } from "../components/common/ui";

const STATUS: Record<string, string> = { parsing: "読み取り中", preview: "確認待ち", saving: "保存中", saved: "保存済み", failed: "失敗" };

export function ImportPage() {
  const { orgId, org, canEdit } = useOrgCtx();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = useCreditAction(org.credits);
  const nav = useNavigate();
  const past = useCol<ImportDoc>(`organizations/${orgId}/imports`, { orderBy: ["createdAt", "desc"], limit: 10 });
  const credits = importCredits(text);
  const tooLong = text.length > IMPORT_MAX_CHARS;

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr("");
    try {
      setText(await fileToText(f));
      setFileName(f.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ファイルを読めませんでした。");
    }
  }

  async function parse() {
    setBusy(true);
    setErr("");
    try {
      const r = await run({
        title: "データを読み取る", credits, detail: `${text.length.toLocaleString()}文字を${credits}回に分けて読み取ります。`,
        exec: () => call<{ importId: string }>("parseImport", { orgId, text, fileName, requestId: newRequestId() }),
      });
      if (r) nav(`/import/${r.importId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) return <p className="py-10 text-center text-muted">取り込みには編集の権限が必要です。</p>;
  return (
    <div className="space-y-4">
      <PageHead title="データの取り込み" />
      <p className="text-sm text-ink-soft">
        今まで使っていたアプリの書き出し（CSV）、Excel のレシピ表、メモ帳の文章など、形式はそろっていなくて大丈夫です。
        AIが材料と分量を読み取り、保存の前に一覧で確かめられます。
      </p>
      <label className={`${ui.card} flex cursor-pointer flex-col items-center gap-2 border-dashed py-6 text-center`}>
        <span className="text-clay"><Icon name="file" className="h-8 w-8" /></span>
        <span className="font-bold">{fileName || "ファイルを選ぶ"}</span>
        <span className="text-xs text-muted">CSV・Excel（.xlsx）・テキスト</span>
        <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <label className="block space-y-1">
        <span className={ui.label}>または、ここに貼り付け（読み取った中身もここに出ます。直してから読み取れます）</span>
        <textarea className={`${ui.input} h-48 font-mono text-xs`} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setFileName(""); }}
          placeholder={"フィナンシェ\nバター 120g\nグラニュー糖 110g\n…"} />
      </label>
      {text && (
        <p className={`text-sm ${tooLong ? "text-ng" : "text-muted"}`}>
          {text.length.toLocaleString()}文字{tooLong ? `：1回に読めるのは${IMPORT_MAX_CHARS.toLocaleString()}文字までです。ファイルを分けてください。` : `（${IMPORT_CHUNK_CHARS.toLocaleString()}文字ごとに1クレジット）`}
        </p>
      )}
      {err && <p className="rounded-xl bg-ng-soft p-3 text-sm text-ng-strong">{err}</p>}
      <button disabled={busy || !text.trim() || tooLong} onClick={parse} className={`w-full ${ui.primary}`}>
        {busy ? "読み取っています…（大きいファイルは数分かかります）" : "読み取る"}{!busy && credits > 0 && <CostTag credits={credits} />}
      </button>

      {past.list.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">これまでの取り込み</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-paper">
            {past.list.map((p) => (
              <li key={p.id}>
                <Link to={`/import/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{p.fileName || "貼り付け"}<span className="ml-2 text-xs text-muted">{toDate(p.createdAt)?.toLocaleDateString("ja-JP")}</span></span>
                  <span className="text-xs text-muted">{p.recipes?.length ?? 0}件・{STATUS[p.status] ?? p.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
