// 写真から取り込み：レシピのノートや本を何枚も撮る → 一覧で確かめる → まとめて読み取る → プレビュー（ImportPreviewPage）
// 撮影と一覧は AI経理のレシートの撮影を流用。写真は1枚ずつ Storage に上げ、全部そろってから parseImportPhotos で読む。
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CREDIT_COST, importMaxPhotos } from "@shared/credits";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCaptureTray, type TrayItem } from "../hooks/useCaptureTray";
import { uploadImportPhoto } from "../lib/photos";
import { call, newRequestId } from "../lib/store";
import { PageHead } from "../components/common/Layout";
import { CostTag } from "../components/common/CreditBadge";
import { Icon } from "../components/common/Icon";
import { useCreditAction } from "../components/common/useCreditAction";
import { ui } from "../components/common/ui";
import { CameraShooter } from "../components/import/CameraShooter";
import { CaptureTray } from "../components/import/CaptureTray";

export function ImportPhotosPage() {
  const { orgId, org, canEdit } = useOrgCtx();
  const nav = useNavigate();
  const run = useCreditAction(org.credits);
  // 送った写真の場所。失敗した写真だけ送り直しても、読み取る順は一覧の順のまま
  const batch = useRef(newRequestId());
  const sent = useRef(new Map<string, string>());
  const send = useCallback(async (it: TrayItem) => {
    sent.current.set(it.id, await uploadImportPhoto(orgId, batch.current, it.id, it.file));
  }, [orgId]);
  const tray = useCaptureTray(orgId, send);
  const [shooting, setShooting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const retakeInput = useRef<HTMLInputElement>(null);
  const retakeId = useRef<string | null>(null);

  const count = tray.items.length;
  const max = importMaxPhotos(org.unlimited);
  const credits = count * CREDIT_COST.importPhoto;

  const onCameraUnavailable = useCallback(() => {
    setShooting(false);
    setNotice("この端末ではアプリの中でカメラを開けませんでした（カメラの許可を確かめてください）。「いつものカメラで撮る」でも、撮った写真は下の一覧にたまります。");
  }, []);
  const onShot = useCallback((f: File) => tray.add([f], "camera"), [tray.add]);

  async function readAll() {
    setErr("");
    setBusy(true);
    try {
      const r = await run({
        title: "写真から読み取る", credits,
        detail: `${count}枚の写真を、撮った順に読み取ります。続きのページは同じレシピにまとめます。`,
        exec: async () => {
          const failed = await tray.sendAll();
          if (failed) throw new Error(`${failed}枚を送れませんでした。電波の良い場所で、もう一度「読み取る」を押してください。クレジットは使われていません。`);
          const paths = tray.items.map((i) => sent.current.get(i.id)).filter((p): p is string => !!p);
          const res = await call<{ importId: string }>("parseImportPhotos", { orgId, batchId: batch.current, paths, requestId: newRequestId() }, 1_800_000);
          tray.clearSent();
          batch.current = newRequestId();
          sent.current.clear();
          return res;
        },
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
      <PageHead title="写真から取り込む" back="/import" />
      <p className="text-sm text-ink-soft">
        レシピのノート・本・カードを、1ページずつ撮ってください。手書きでも読めます。
        2ページにまたがるレシピは、続けて撮れば1つにまとめます。保存の前に一覧で確かめられます。
      </p>
      <button type="button" onClick={() => { setNotice(""); setShooting(true); }} disabled={busy}
        className="flex h-40 w-full flex-col items-center justify-center rounded-2xl border border-line bg-paper">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-clay text-white"><Icon name="camera" className="h-7 w-7" /></span>
        <span className="mt-3 text-lg font-bold">続けて撮影する</span>
        <span className="mt-1 text-xs text-muted">何枚でも撮って、最後にまとめて読み取れます</span>
      </button>
      <div className="-mt-2 flex justify-center gap-6 text-sm text-muted">
        <label className="cursor-pointer underline">
          いつものカメラで撮る
          <input type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={(e) => { tray.add(Array.from(e.target.files ?? []), "camera"); e.target.value = ""; }} />
        </label>
        <label className="cursor-pointer underline">
          写真を選ぶ（複数可）
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { tray.add(Array.from(e.target.files ?? []), "upload"); e.target.value = ""; }} />
        </label>
      </div>
      {notice && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn-strong">{notice}</p>}

      <CaptureTray items={tray.items} onRemove={tray.remove} busy={busy}
        onRetake={(id) => { retakeId.current = id; retakeInput.current?.click(); }} />

      {count > max && <p className="text-sm text-ng">1回に読めるのは{max}枚までです。分けて読み取ってください。</p>}
      {err && <p className="rounded-xl bg-ng-soft p-3 text-sm text-ng-strong">{err}</p>}
      {count > 0 && (
        <button disabled={busy || count > max} onClick={readAll} className={`sticky bottom-20 w-full ${ui.primary}`}>
          {busy ? (tray.progress || "読み取っています…（枚数が多いと数分かかります）") : `${count}枚を読み取る`}
          {!busy && credits > 0 && <CostTag credits={credits} />}
        </button>
      )}

      {/* 撮り直し用（いつものカメラで1枚） */}
      <input ref={retakeInput} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && retakeId.current) tray.replace(retakeId.current, f);
          retakeId.current = null;
          e.target.value = "";
        }} />

      {shooting && (
        <CameraShooter count={count} lastUrl={tray.items.at(-1)?.url} onShot={onShot}
          onClose={() => setShooting(false)} onUnavailable={onCameraUnavailable} />
      )}
    </div>
  );
}
