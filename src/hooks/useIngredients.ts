// 店舗の材料マスター。レシピの原価・ラベル・材料の選択で何度も使うので、id で引ける Map も一緒に返す
import { useMemo } from "react";
import type { Ingredient } from "@shared/types";
import { useCol } from "./useData";

export function useIngredients(orgId: string) {
  const { list, loading } = useCol<Omit<Ingredient, "id">>(`organizations/${orgId}/ingredients`);
  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name, "ja")) as Ingredient[], [list]);
  const byId = useMemo(() => new Map(sorted.map((i) => [i.id, i])), [sorted]);
  return { list: sorted, byId, loading };
}
