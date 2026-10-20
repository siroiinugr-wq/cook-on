// 既製品のパッケージを撮る2つの枠：表（商品の顔。商品の画像になる）と裏（原材料名・栄養成分表示。AIが読む）
import { useEffect, useState } from "react";
import { Icon } from "../common/Icon";

export interface PackageShots { front: File | null; back: File | null }

function Slot({ label, hint, file, onPick }: { label: string; hint: string; file: File | null; onPick: (f: File | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="space-y-1">
      <label className="flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-sand">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (
          <span className="flex flex-col items-center gap-1 text-xs text-muted"><Icon name="camera" />{label}</span>
        )}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      <p className="text-[11px] text-muted">{file ? <button type="button" className="underline" onClick={() => onPick(null)}>撮り直す・外す</button> : hint}</p>
    </div>
  );
}

export function PackagePhotos({ shots, onChange }: { shots: PackageShots; onChange: (s: PackageShots) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Slot label="表を撮る" hint="商品名が見える面。商品の画像になります" file={shots.front} onPick={(front) => onChange({ ...shots, front })} />
      <Slot label="裏を撮る" hint="原材料名と栄養成分表示の面" file={shots.back} onPick={(back) => onChange({ ...shots, back })} />
    </div>
  );
}
