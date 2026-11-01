// アドレスの「#price」のような目印の場所まで画面を動かす（ほかの画面から、目的のカードへ直接とぶため）。
// react-router は # の場所へは動かないので、読み込みが終わった（ready）あとに自分で動かす
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useHashScroll(ready = true) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => clearTimeout(t);
  }, [ready, hash]);
}

/** いまのアドレスの # がこの目印か（折りたたみを開いておくため） */
export function hashIs(id: string): boolean {
  return typeof window !== "undefined" && window.location.hash === `#${id}`;
}
