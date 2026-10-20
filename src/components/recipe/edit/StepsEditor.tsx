// 作り方の編集。1工程に写真を1枚つけられる（作業モードで大きく出る）
import { useState } from "react";
import type { RecipeStep } from "@shared/types";
import { uploadPhoto, usePhotoUrl } from "../../../lib/photos";
import { Icon } from "../../common/Icon";
import { ui } from "../../common/ui";

export function StepsEditor({ steps, set, photoDir }: { steps: RecipeStep[]; set: (s: RecipeStep[]) => void; photoDir: string }) {
  const [busy, setBusy] = useState(-1);
  const [err, setErr] = useState("");
  const patch = (i: number, p: Partial<RecipeStep>) => set(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };

  async function addPhoto(i: number, f: File | undefined) {
    if (!f) return;
    setBusy(i);
    setErr("");
    try {
      patch(i, { photoPath: await uploadPhoto(photoDir, f) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を上げられませんでした。");
    } finally {
      setBusy(-1);
    }
  }

  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex gap-2 rounded-xl border border-line bg-paper p-2.5">
          <div className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-clay-soft text-xs font-bold text-clay-strong">{i + 1}</span>
            {i > 0 && <button className="text-xs text-faint" aria-label="上へ" onClick={() => move(i, -1)}>▲</button>}
            {i < steps.length - 1 && <button className="text-xs text-faint" aria-label="下へ" onClick={() => move(i, 1)}>▼</button>}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <textarea className="w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm" rows={2} value={s.text} onChange={(e) => patch(i, { text: e.target.value })} placeholder="例：バターを室温に戻す" />
            <div className="flex items-center gap-2">
              {s.photoPath ? <Thumb path={s.photoPath} onRemove={() => patch(i, { photoPath: null })} /> : (
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
                  <Icon name="photo" className="h-4 w-4" />{busy === i ? "上げています…" : "写真をつける"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => addPhoto(i, e.target.files?.[0])} />
                </label>
              )}
              <button className="ml-auto text-faint" aria-label="この工程を消す" onClick={() => set(steps.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      ))}
      {err && <p className="text-sm text-ng">{err}</p>}
      <button className={`${ui.secondary} w-full py-2 text-sm`} onClick={() => set([...steps, { text: "" }])}>＋ 工程を足す</button>
    </div>
  );
}

function Thumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const url = usePhotoUrl(path);
  return (
    <span className="flex items-center gap-1">
      {url ? <img src={url} alt="" className="h-12 w-16 rounded-md object-cover" /> : <span className="h-12 w-16 rounded-md bg-sand" />}
      <button className="text-xs text-muted underline" onClick={onRemove}>外す</button>
    </span>
  );
}
