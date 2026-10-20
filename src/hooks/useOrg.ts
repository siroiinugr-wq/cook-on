// いま開いている店舗の情報（名前・クレジット残高・設定）
import { DEFAULT_TARGET_RATE } from "@shared/cost";
import { useDoc } from "./useData";

export interface OrgSettings {
  targetCostRate: number;
  /** ラベルの「製造者」の欄 */
  manufacturer: string;
  /** ラベルに推奨20品目のアレルゲンも書くか */
  includeRecommendedAllergens: boolean;
  /** 読み取った既製品を、みんなの既製品データベースにも入れるか（null＝まだ聞いていない。初めて登録するときに1回だけ聞く） */
  shareProducts: boolean | null;
}

export interface Org {
  name: string;
  plan: string;
  /** 無制限の店舗は Infinity（クレジットを使わない。運営がコンソールで organizations.unlimited を付ける） */
  credits: number;
  unlimited: boolean;
  settings: OrgSettings;
}

export function useOrg(orgId: string) {
  const { data, loading } = useDoc<Partial<Org>>(`organizations/${orgId}`);
  const unlimited = data?.unlimited === true;
  const s = (data?.settings ?? {}) as Partial<OrgSettings>;
  const org: Org = {
    name: data?.name ?? "",
    plan: data?.plan ?? "free",
    credits: unlimited ? Infinity : Number(data?.credits ?? 0),
    unlimited,
    settings: {
      targetCostRate: s.targetCostRate || DEFAULT_TARGET_RATE,
      manufacturer: s.manufacturer ?? data?.name ?? "",
      includeRecommendedAllergens: s.includeRecommendedAllergens !== false,
      shareProducts: typeof s.shareProducts === "boolean" ? s.shareProducts : null,
    },
  };
  return { org, loading };
}
