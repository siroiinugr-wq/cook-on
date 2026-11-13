// いま開いている店舗の情報（名前・クレジット残高・設定）
import { DEFAULT_TARGET_RATE } from "@shared/cost";
import { toDate } from "../lib/store";
import { useDoc } from "./useData";

export interface OrgSettings {
  targetCostRate: number;
  /** ラベルの「製造者」の名前 */
  manufacturer: string;
  /** ラベルの製造者の住所（食品表示に必要。空ならラベルを印刷できない） */
  manufacturerAddress: string;
  /** ラベルに推奨20品目のアレルゲンも書くか */
  includeRecommendedAllergens: boolean;
  /** 読み取った既製品を、みんなの既製品データベースにも入れるか（null＝まだ聞いていない。初めて登録するときに1回だけ聞く） */
  shareProducts: boolean | null;
  /** 確かめた材料の情報（呼び方・アレルゲン・仕入れ値）を共有の材料への提案として出すか（運営が精査して採用したものだけ共有に入る） */
  shareIngredients: boolean;
  /** ラベルの初期値（レシピに覚えた値があればそちらが先） */
  labelExpiryKind: "賞味期限" | "消費期限";
  labelExpiryDays: number;
  labelStorage: string;
  /** 期限の日付を枠の外に書く（枠の中は「枠外下部に記載」） */
  labelDateOutside: boolean;
  /** 枠の外の日付も印刷する（false＝スタンプや手書きで入れる） */
  labelDatePrint: boolean;
  /** ラベルに栄養成分表示を入れる（既定は入れる。小規模事業者などで省略できるお店は外せる。レシピごとの選択が先） */
  labelNutrition: boolean;
  /** 栄養成分を何あたりで書くか（既定は100gあたり。"piece"＝1個あたり） */
  labelNutritionBasis: "100g" | "piece";
}

export interface Org {
  name: string;
  plan: string;
  /** 無制限の店舗は Infinity（クレジットを使わない。運営がコンソールで organizations.unlimited を付ける） */
  credits: number;
  unlimited: boolean;
  settings: OrgSettings;
  /** AI経理との自動連携（link/keiri.ts が書く。無ければ連携していない） */
  keiriLink: { createdAt: Date | null; lastAt: Date | null; count: number; sender: string } | null;
}

export function useOrg(orgId: string) {
  const { data, loading } = useDoc<Partial<Org>>(`organizations/${orgId}`);
  const unlimited = data?.unlimited === true;
  const s = (data?.settings ?? {}) as Partial<OrgSettings>;
  const k = (data as { keiriLink?: Record<string, unknown> } | null)?.keiriLink;
  const org: Org = {
    name: data?.name ?? "",
    plan: data?.plan ?? "free",
    credits: unlimited ? Infinity : Number(data?.credits ?? 0),
    unlimited,
    keiriLink: k ? { createdAt: toDate(k.createdAt), lastAt: toDate(k.lastAt), count: Number(k.count ?? 0), sender: String(k.sender ?? "") } : null,
    settings: {
      targetCostRate: s.targetCostRate || DEFAULT_TARGET_RATE,
      manufacturer: s.manufacturer ?? data?.name ?? "",
      manufacturerAddress: s.manufacturerAddress ?? "",
      includeRecommendedAllergens: s.includeRecommendedAllergens !== false,
      shareProducts: typeof s.shareProducts === "boolean" ? s.shareProducts : null,
      shareIngredients: s.shareIngredients === true,
      labelExpiryKind: s.labelExpiryKind === "消費期限" ? "消費期限" : "賞味期限",
      labelExpiryDays: Number(s.labelExpiryDays) > 0 ? Number(s.labelExpiryDays) : 7,
      labelStorage: typeof s.labelStorage === "string" ? s.labelStorage : "",
      labelDateOutside: s.labelDateOutside === true,
      labelDatePrint: s.labelDatePrint !== false,
      labelNutrition: s.labelNutrition !== false,
      labelNutritionBasis: s.labelNutritionBasis === "piece" ? "piece" : "100g",
    },
  };
  return { org, loading };
}
