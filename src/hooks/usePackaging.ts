// 店舗の包装資材と包装セット。レシピの原価（包装の分）と、包装資材の画面で使う
import { useMemo } from "react";
import type { PackCtx } from "@shared/packaging";
import type { PackagingMaterial, PackagingSet } from "@shared/types";
import { useCol } from "./useData";

export function usePackaging(orgId: string) {
  const mats = useCol<Omit<PackagingMaterial, "id">>(`organizations/${orgId}/packaging`);
  const sets = useCol<Omit<PackagingSet, "id">>(`organizations/${orgId}/packagingSets`);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ja");
  const materials = useMemo(() => [...mats.list].sort(byName) as PackagingMaterial[], [mats.list]);
  const setList = useMemo(() => [...sets.list].sort(byName) as PackagingSet[], [sets.list]);
  const ctx = useMemo<PackCtx>(() => ({
    matById: new Map(materials.map((m) => [m.id, m])),
    setById: new Map(setList.map((s) => [s.id, s])),
  }), [materials, setList]);
  return { materials, sets: setList, ctx, loading: mats.loading || sets.loading };
}
