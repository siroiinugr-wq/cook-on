// レシピ1件と、倍率（?x=2.5）の読み書き。詳細・作業モード・ラベルで同じ倍率を引き継ぐ
import { useSearchParams } from "react-router-dom";
import type { ScaleMode } from "@shared/cost";
import type { Recipe } from "@shared/types";
import { useDoc } from "./useData";

export function useRecipe(orgId: string, id: string | undefined) {
  const { data, loading } = useDoc<Recipe>(id ? `organizations/${orgId}/recipes/${id}` : null);
  return { recipe: data as Recipe | null, loading };
}

/** ?x=2.5（ロット数）か ?n=30（欲しい個数）。どちらも無ければ 1 ロット */
export function useScale(): [ScaleMode, (m: ScaleMode) => void] {
  const [sp, setSp] = useSearchParams();
  const n = Number(sp.get("n"));
  const x = Number(sp.get("x"));
  const mode: ScaleMode = n > 0 ? { kind: "pieces", pieces: n } : { kind: "lot", lots: x > 0 ? x : 1 };
  const set = (m: ScaleMode) => {
    const next = new URLSearchParams(sp);
    next.delete("x");
    next.delete("n");
    if (m.kind === "pieces") next.set("n", String(m.pieces));
    else if (m.lots !== 1) next.set("x", String(m.lots));
    setSp(next, { replace: true });
  };
  return [mode, set];
}
