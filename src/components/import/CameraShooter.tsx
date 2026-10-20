// 続けて撮影（AI経理の CameraShooter を流用）：アプリの中でカメラを開いたまま、シャッターを押すたびに1枚ずつ一覧へ足す。
// iPhone の標準カメラのように「写真を使用」を毎回押さなくてよい。カメラが使えない端末・許可されなかったときは
// onUnavailable で標準のカメラ（ファイル選択）に切り替える。
import { useEffect, useRef, useState } from "react";
import { photoName } from "../../lib/captureTray";

export function CameraShooter({ count, lastUrl, onShot, onClose, onUnavailable }: {
  count: number;
  lastUrl?: string;
  onShot: (file: File) => void;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        // 背面カメラ・できるだけ高い解像度（手書きの小さな字が読めるように）
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setReady(true);
        }
      } catch {
        if (!stopped) onUnavailable();
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onShot(new File([blob], photoName(blob.type), { type: blob.type }));
    }, "image/jpeg", 0.92);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">カメラを準備しています…</p>}
        {flash && <div className="absolute inset-0 bg-white/70" />}
        <p className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-center text-sm">
          レシピを1ページずつ枠いっぱいに写して、シャッターを押してください
        </p>
      </div>
      <div className="flex items-center justify-between bg-black px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <div className="relative h-14 w-14">
          {lastUrl && <img src={lastUrl} alt="" className="h-14 w-14 rounded-lg border-2 border-white/80 object-cover" />}
          {count > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-clay px-2 py-0.5 text-xs font-bold">{count}</span>}
        </div>
        <button type="button" onClick={shoot} disabled={!ready} aria-label="撮る"
          className="h-20 w-20 rounded-full border-4 border-white bg-white/20 active:bg-white/60 disabled:opacity-40" />
        <button type="button" onClick={onClose} className="h-14 w-14 rounded-xl bg-clay text-sm font-bold">完了</button>
      </div>
    </div>
  );
}
