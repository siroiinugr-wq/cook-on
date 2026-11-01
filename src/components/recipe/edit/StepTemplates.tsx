// よく使う工程：名前を付けて保存し（1つでも、いくつかまとめてでも）、レシピの編集ですぐ呼び出す。
// 保存先は organizations/{orgId}/stepTemplates（お店のみんなで使える）
import { useState } from "react";
import type { StepTemplate } from "@shared/types";
import { useCol } from "../../../hooks/useData";
import { newId, removeDoc, saveDoc } from "../../../lib/store";
import { useConfirm } from "../../common/ConfirmDialog";
import { Sheet } from "../../common/Sheet";
import { ui } from "../../common/ui";

export function useStepTemplates(orgId: string) {
  const { list } = useCol<StepTemplate>(`organizations/${orgId}/stepTemplates`);
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 一覧から選んで入れる。押した工程は今の作り方の最後に足す */
export function PickTemplateSheet({ orgId, onPick, onClose }: { orgId: string; onPick: (steps: string[]) => void; onClose: () => void }) {
  const list = useStepTemplates(orgId);
  const [q, setQ] = useState("");
  const confirm = useConfirm();
  const shown = list.filter((t) => !q.trim() || t.name.includes(q.trim()) || t.steps.some((s) => s.includes(q.trim())));

  async function remove(t: StepTemplate) {
    if (await confirm({ title: `「${t.name}」を消しますか？`, body: "レシピに入れた工程はそのまま残ります。", ok: "消す" })) {
      await removeDoc(`organizations/${orgId}/stepTemplates/${t.id}`);
    }
  }

  return (
    <Sheet title="よく使う工程から入れる" onClose={onClose}>
      <div className="space-y-3">
        {list.length > 5 && <input className={ui.input} placeholder="名前や中身で探す" value={q} onChange={(e) => setQ(e.target.value)} />}
        {!list.length && <p className="text-sm text-muted">まだありません。工程の右下の「よく使う工程に保存」で、ここに入ります。</p>}
        <ul className="space-y-2">
          {shown.map((t) => (
            <li key={t.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => { onPick(t.steps); onClose(); }}>
                  <p className="font-bold">{t.name}<span className="ml-2 text-xs font-normal text-muted">{t.steps.length}工程</span></p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-ink-soft">
                    {t.steps.slice(0, 4).map((s, i) => <li key={i} className="line-clamp-2">{s}</li>)}
                    {t.steps.length > 4 && <li className="list-none text-muted">ほか{t.steps.length - 4}工程</li>}
                  </ol>
                </button>
                <button className="shrink-0 text-xs text-muted underline" onClick={() => remove(t)}>消す</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/** 名前を付けて保存する（steps はまとめて1つのテンプレートになる） */
export function SaveTemplateSheet({ orgId, uid, steps, onClose }: { orgId: string; uid: string; steps: string[]; onClose: () => void }) {
  const [name, setName] = useState(() => steps[0]?.slice(0, 20) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = steps.map((s) => s.trim()).filter(Boolean).slice(0, 20);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const path = `organizations/${orgId}/stepTemplates`;
      await saveDoc(`${path}/${newId(path)}`, { name: name.trim().slice(0, 40), steps: clean.map((s) => s.slice(0, 400)), createdBy: uid }, { merge: false });
      onClose();
    } catch {
      setErr("保存できませんでした。");
      setBusy(false);
    }
  }

  return (
    <Sheet title="よく使う工程に保存" onClose={onClose}>
      <div className="space-y-3">
        <label className="block space-y-1"><span className={ui.label}>名前（呼び出すときに探す名前）</span>
          <input className={ui.input} value={name} maxLength={40} placeholder="例：バターと砂糖をすり混ぜる" onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <ol className="list-decimal space-y-1 rounded-xl bg-sand p-3 pl-8 text-sm">{clean.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !name.trim() || !clean.length} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "保存する"}</button>
      </div>
    </Sheet>
  );
}
