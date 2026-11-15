// 店舗の材料マスター。レシピの原価・ラベル・材料の選択で何度も使うので、id で引ける Map も一緒に返す
import { useMemo } from "react";
import type { Ingredient } from "@shared/types";
import { useCol } from "./useData";
import { useOrgCtx } from "../contexts/OrgContext";

/** orgId は呼び出し側の読みやすさのため。読む場所は役割で決まる（スタッフは値段を抜いた写し） */
export function useIngredients(_orgId: string) {
  const { ingredientsPath } = useOrgCtx();
  const { list, loading } = useCol<Omit<Ingredient, "id">>(ingredientsPath);
  // スタッフの写しには仕入れ値が無いので null にそろえる（原価の計算が「値段なし」として扱う）
  const sorted = useMemo(() => list.map((d) => ({ ...d, purchasePrice: d.purchasePrice ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja")) as Ingredient[], [list]);
  const byId = useMemo(() => new Map(sorted.map((i) => [i.id, i])), [sorted]);
  return { list: sorted, byId, loading };
}
