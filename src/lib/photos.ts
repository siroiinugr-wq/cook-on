// 工程の写真。スマホの写真は大きいので、長い辺 1280px の JPEG に縮めてから上げる（容量と読み込みの速さのため）
// デモモードでは Storage が無いので、縮めた画像をそのまま data URL で持つ
import { useEffect, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { isDemo, storage } from "./firebase";

const MAX = 1280;

async function shrink(file: File, max = MAX): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, ng) => canvas.toBlob((b) => (b ? ok(b) : ng(new Error("画像を読み込めませんでした。"))), "image/jpeg", 0.82));
}

const toDataUrl = (b: Blob) => new Promise<string>((ok) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.readAsDataURL(b);
});

/** 上げた写真の「場所」を返す（レシピには場所だけ保存する） */
export async function uploadPhoto(dir: string, file: File, max = MAX): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("画像のファイルを選んでください。");
  const blob = await shrink(file, max);
  if (isDemo || !storage) return toDataUrl(blob);
  const path = `${dir}/${Date.now()}.jpg`;
  await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
  return path;
}

/** 場所から表示用のURLを作る */
export function usePhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return setUrl(null);
    if (path.startsWith("data:") || path.startsWith("http")) return setUrl(path);
    if (!storage) return;
    let alive = true;
    getDownloadURL(ref(storage, path)).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path]);
  return url;
}

/** ロゴ：公開で読めるURLをそのまま保存する（ログイン画面でも使うため） */
export async function uploadLogo(orgId: string, file: File): Promise<string> {
  const path = await uploadPhoto(`orgs/${orgId}/branding`, file, 256);
  if (path.startsWith("data:") || !storage) return path;
  return getDownloadURL(ref(storage, path));
}
