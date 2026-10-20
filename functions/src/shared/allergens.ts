// アレルゲンの一覧（消費者庁「食物アレルギー表示」）。表示の順もこの並び。
// 特定原材料（表示義務）8品目と、特定原材料に準ずるもの（推奨）20品目。
// 制度が変わったらここだけ直す（2025-04 時点：くるみが義務、マカダミアナッツが推奨に入り、まつたけが外れた）。

export const ALLERGENS = [
  { id: "shrimp", name: "えび", required: true },
  { id: "crab", name: "かに", required: true },
  { id: "walnut", name: "くるみ", required: true },
  { id: "wheat", name: "小麦", required: true },
  { id: "buckwheat", name: "そば", required: true },
  { id: "egg", name: "卵", required: true },
  { id: "milk", name: "乳成分", required: true },
  { id: "peanut", name: "落花生", required: true },
  { id: "almond", name: "アーモンド", required: false },
  { id: "abalone", name: "あわび", required: false },
  { id: "squid", name: "いか", required: false },
  { id: "salmonroe", name: "いくら", required: false },
  { id: "orange", name: "オレンジ", required: false },
  { id: "cashew", name: "カシューナッツ", required: false },
  { id: "kiwi", name: "キウイフルーツ", required: false },
  { id: "beef", name: "牛肉", required: false },
  { id: "sesame", name: "ごま", required: false },
  { id: "salmon", name: "さけ", required: false },
  { id: "mackerel", name: "さば", required: false },
  { id: "soy", name: "大豆", required: false },
  { id: "chicken", name: "鶏肉", required: false },
  { id: "banana", name: "バナナ", required: false },
  { id: "pork", name: "豚肉", required: false },
  { id: "macadamia", name: "マカダミアナッツ", required: false },
  { id: "peach", name: "もも", required: false },
  { id: "yam", name: "やまいも", required: false },
  { id: "apple", name: "りんご", required: false },
  { id: "gelatin", name: "ゼラチン", required: false },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]["id"];

const ORDER = new Map<string, number>(ALLERGENS.map((a, i) => [a.id, i]));
const NAME = new Map<string, string>(ALLERGENS.map((a) => [a.id, a.name]));

export function isAllergenId(x: unknown): x is AllergenId {
  return typeof x === "string" && ORDER.has(x);
}

export function allergenName(id: AllergenId): string {
  return NAME.get(id) ?? id;
}

/** 重なりを除いて、表示の順に並べる */
export function sortAllergens(ids: Iterable<string>): AllergenId[] {
  return [...new Set(ids)].filter(isAllergenId).sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

/** 名前（「乳」「小麦」など）から id を探す。AIの答えや取り込んだ文字を直すのに使う */
export function allergenFromName(name: string): AllergenId | null {
  const s = name.normalize("NFKC").trim();
  const hit = ALLERGENS.find((a) => a.name === s || (a.id === "milk" && (s === "乳" || s === "乳製品")));
  return hit ? hit.id : null;
}
