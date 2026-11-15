// 店舗の包装資材と包装セット。レシピの原価（包装の分）と、包装資材の画面で使う
import { useMemo } from "react";
import type { PackCtx } from "@shared/packaging";
import type { PackagingMaterial, PackagingSet } from "@shared/types";
import { useCol } from "./useData";
import { useOrgCtx } from "../contexts/OrgContext";

export function usePackaging(orgId: string) {
  // 値段が入っているので、スタッフは読まない（ルールでも読めない）
  const { seeMoney } = useOrgCtx();
  const mats = useCol<Omit<PackagingMaterial, "id">>(seeMoney ? `organizations/${orgId}/packaging` : null);
  const sets = useCol<Omit<PackagingSet, "id">>(seeMoney ? `organizations/${orgId}/packagingSets` : null);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ja");
  const materials = useMemo(() => [...mats.list].sort(byName) as PackagingMaterial[], [mats.list]);
  const setList = useMemo(() => [...sets.list].sort(byName) as PackagingSet[], [sets.list]);
  const ctx = useMemo<PackCtx>(() => ({
    matById: new Map(materials.map((m) => [m.id, m])),
    setById: new Map(setList.map((s) => [s.id, s])),
  }), [materials, setList]);
  return { materials, sets: setList, ctx, loading: mats.loading || sets.loading };
}
