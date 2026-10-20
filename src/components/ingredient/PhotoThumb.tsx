// 材料・既製品の小さな写真。写真が無ければ何も出さない
import { usePhotoUrl } from "../../lib/photos";

export function PhotoThumb({ path, className = "h-10 w-10" }: { path: string | null | undefined; className?: string }) {
  const url = usePhotoUrl(path);
  if (!path) return null;
  return url ? <img src={url} alt="" className={`${className} shrink-0 rounded-lg object-cover`} /> : <span className={`${className} shrink-0 rounded-lg bg-sand`} />;
}
