// データの取り込み（ほかのアプリや Excel からの引っ越し）。
// ファイルを選ぶ（ドロップでも）／貼る → 使うクレジットを先に見せる → AIが読み取る → プレビュー（ImportPreviewPage）で確かめて保存
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IMPORT_CHUNK_CHARS, importCredits, importMaxChars } from "@shared/credits";
import type { ImportDoc } from "@shared/importTypes";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { ACCEPT, fileToText } from "../lib/importFile";
import { call, newRequestId } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { CostTag } from "../components/common/CreditBadge";
import { Icon } from "../components/common/Icon";
import { useCreditAction } from "../components/common/useCreditAction";
import { ui } from "../components/common/ui";
import { PastImports } from "../components/import/PastImports";

export function ImportPage() {
  const { orgId, org, canEdit } = useOrgCtx();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);
  const run = useCreditAction(org.credits);
  const nav = useNavigate();
  const past = useCol<ImportDoc>(`organizations/${orgId}/imports`, { orderBy: ["createdAt", "desc"], limit: 100 });
  const credits = importCredits(text);
  const maxChars = importMaxChars(org.unlimited);
  const tooLong = text.length > maxChars;

  async function pick(files: FileList | null | undefined) {
    const f = files?.[0];
    if (!f) return;
    setErr("");
    if (files.length > 1) setErr(`1回に読めるのは1つのファイルです。いちばん上の「${f.name}」を読みました。`);
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
        exec: () => call<{ importId: string }>("parseImport", { orgId, text, fileName, requestId: newRequestId() }, 1_800_000),
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
      <PageHead title="データの取り込み" back="/todo" />
      <p className="text-sm text-ink-soft">
        今まで使っていたアプリの書き出し（CSV）、Excel のレシピ表、メモ帳の文章など、形式はそろっていなくて大丈夫です。
        AIが材料と分量を読み取り、保存の前に一覧で確かめられます。
      </p>
      <Link to="/import/photos" className={`${ui.card} flex items-center gap-3`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-clay text-white"><Icon name="camera" className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1"><b className="block">写真から取り込む</b><span className="text-xs text-muted">レシピのノートや本を何枚も撮って、まとめて読み取る（手書きも可）</span></span>
        <Icon name="chevron" className="h-5 w-5 text-faint" />
      </Link>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        className={`${ui.card} flex cursor-pointer flex-col items-center gap-2 border-dashed py-6 text-center ${over ? "border-clay bg-clay-soft" : ""}`}>
        <span className="text-clay"><Icon name="file" className="h-8 w-8" /></span>
        <span className="font-bold">{over ? "ここで離すと読み込みます" : fileName || "ファイルを選ぶ・ここにドロップ"}</span>
        <span className="text-xs text-muted">CSV・Excel（.xlsx）・テキスト（.txt）</span>
        <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </label>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">どのファイルが読める？</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>CSV：ほかのアプリや Excel・Google スプレッドシートで書き出したものは読めます。表の1行目の見出し（レシピ名・材料・分量など）を手がかりにします。</li>
          <li>Excel（.xlsx）：シートが分かれていても読めます。シートの名前がレシピ名のときは、その名前を使います。</li>
          <li>Numbers：そのままや CSV ではレシピ名（シートの名前）が消えるので、「ファイル → 書き出す → Excel」で .xlsx にしてから入れてください。</li>
          <li>PDF・画像：「写真から取り込む」を使うか、文字をコピーして下の欄に貼ってください。</li>
        </ul>
      </details>
      <label className="block space-y-1">
        <span className={ui.label}>または、ここに貼り付け（読み取った中身もここに出ます。直してから読み取れます）</span>
        <textarea className={`${ui.input} h-48 font-mono text-xs`} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setFileName(""); }}
          placeholder={"フィナンシェ\nバター 120g\nグラニュー糖 110g\n…"} />
      </label>
      {text && (
        <p className={`text-sm ${tooLong ? "text-ng" : "text-muted"}`}>
          {text.length.toLocaleString()}文字{tooLong ? `：1回に読めるのは${maxChars.toLocaleString()}文字までです。ファイルを分けてください。` : org.unlimited ? "（無制限の設定のため、クレジットは使いません）" : `（${IMPORT_CHUNK_CHARS.toLocaleString()}文字ごとに1クレジット）`}
        </p>
      )}
      {err && <p className="rounded-xl bg-ng-soft p-3 text-sm text-ng-strong">{err}</p>}
      <button disabled={busy || !text.trim() || tooLong} onClick={parse} className={`w-full ${ui.primary}`}>
        {busy ? "読み取っています…（大きいファイルは数分かかります）" : "読み取る"}{!busy && credits > 0 && <CostTag credits={credits} />}
      </button>

      <PastImports orgId={orgId} list={past.list} canEdit={canEdit} />
    </div>
  );
}
