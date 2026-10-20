// いま開いている店舗の情報（名前・クレジット残高・設定）
import { DEFAULT_TARGET_RATE } from "@shared/cost";
import { useDoc } from "./useData";

export interface OrgSettings {
  targetCostRate: number;
  /** ラベルの「製造者」の欄 */
  manufacturer: string;
  /** ラベルに推奨20品目のアレルゲンも書くか */
  includeRecommendedAllergens: boolean;
}

export interface Org {
  name: string;
  plan: string;
  credits: number;
  settings: OrgSettings;
}

export function useOrg(orgId: string) {
  const { data, loading } = useDoc<Partial<Org>>(`organizations/${orgId}`);
  const s = (data?.settings ?? {}) as Partial<OrgSettings>;
  const org: Org = {
    name: data?.name ?? "",
    plan: data?.plan ?? "free",
    credits: Number(data?.credits ?? 0),
    settings: {
      targetCostRate: s.targetCostRate || DEFAULT_TARGET_RATE,
      manufacturer: s.manufacturer ?? data?.name ?? "",
      includeRecommendedAllergens: s.includeRecommendedAllergens !== false,
    },
  };
  return { org, loading };
}
