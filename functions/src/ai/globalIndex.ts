// 共有マスター（globalIngredients）を名寄せ用に読み込み、関数のインスタンスの中で30分覚えておく。
// 成分表だけで約2,500件。毎回読むと読み取り料金と時間がかかるため。
import { getFirestore } from "firebase-admin/firestore";
import { buildIndex, type IndexedEntry } from "../shared/matchKey";
import type { AllergenId } from "../shared/allergens";

export interface GlobalLite {
  id: string;
  name: string;
  aliases: string[];
  allergens: AllergenId[];
  category: string;
}

let cache: { at: number; index: IndexedEntry[]; byId: Map<string, GlobalLite> } | null = null;
const TTL_MS = 30 * 60_000;

export async function globalIndex() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const snap = await getFirestore().collection("globalIngredients").select("name", "aliases", "allergens", "category").get();
  const list: GlobalLite[] = snap.docs.map((d) => ({
    id: d.id,
    name: String(d.get("name") ?? ""),
    aliases: (d.get("aliases") as string[] | undefined) ?? [],
    allergens: (d.get("allergens") as AllergenId[] | undefined) ?? [],
    category: String(d.get("category") ?? ""),
  }));
  cache = { at: Date.now(), index: buildIndex(list), byId: new Map(list.map((x) => [x.id, x])) };
  return cache;
}
