// レシピの写真・イラスト（最大6枚。先頭が一覧と詳細の表紙）。工程ごとの写真は StepsEditor
import { useState } from "react";
import { RECIPE_LIMITS } from "@shared/recipe";
import { uploadPhoto, usePhotoUrl } from "../../../lib/photos";
import { Icon } from "../../common/Icon";

export function RecipePhotos({ photos, set: update, photoDir }: { photos: string[]; set: (f: (cur: string[]) => string[]) => void; photoDir: string }) {
  const set = (p: string[]) => update(() => p);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    try {
      const room = RECIPE_LIMITS.photos - photos.length;
      const added: string[] = [];
      for (const f of [...files].slice(0, room)) added.push(await uploadPhoto(photoDir, f));
      // 上げている間にほかを直していても消さないよう、いまの一覧に足す
      update((cur) => [...cur, ...added].slice(0, RECIPE_LIMITS.photos));
      if (files.length > room) setErr(`写真は${RECIPE_LIMITS.photos}枚までです。`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を上げられませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number) => set([photos[i], ...photos.filter((_, j) => j !== i)]);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">写真・イラスト（1枚目が表紙）</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => <Thumb key={`${i}-${p.slice(-24)}`} path={p} first={i === 0} onFirst={() => move(i)} onRemove={() => set(photos.filter((_, j) => j !== i))} />)}
        {photos.length < RECIPE_LIMITS.photos && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-[11px] text-muted">
            <Icon name="camera" className="h-6 w-6" />{busy ? "上げています…" : "追加"}
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => add(e.target.files)} />
          </label>
        )}
      </div>
      {err && <p className="text-sm text-ng">{err}</p>}
    </div>
  );
}

function Thumb({ path, first, onFirst, onRemove }: { path: string; first: boolean; onFirst: () => void; onRemove: () => void }) {
  const url = usePhotoUrl(path);
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-sand">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <button type="button" onClick={onRemove} aria-label="外す" className="absolute right-0.5 top-0.5 rounded-full bg-ink/60 p-0.5 text-white"><Icon name="close" className="h-3.5 w-3.5" /></button>
      {first
        ? <span className="absolute inset-x-0 bottom-0 bg-ink/60 text-center text-[10px] text-white">表紙</span>
        : <button type="button" onClick={onFirst} className="absolute inset-x-0 bottom-0 bg-ink/40 text-center text-[10px] text-white">表紙にする</button>}
    </div>
  );
}
