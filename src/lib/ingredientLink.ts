// レシピの材料行を、店舗の材料（原価の元）に結びつける。
// 共有マスターの材料を選んだときは、店舗の材料として写してから結ぶ（仕入れ値は店舗ごとに違うので空で作る）
import { suggestAllergens } from "@shared/allergenGuess";
import { refPricePatch } from "@shared/link";
import type { ItemMatch } from "@shared/importTypes";
import type { GlobalIngredient, Ingredient } from "@shared/types";
import { getOnce, newId, saveDoc } from "./store";

export async function createIngredient(orgId: string, uid: string, d: Partial<Ingredient> & { name: string }): Promise<string> {
  const path = `organizations/${orgId}/ingredients`;
  const id = newId(path);
  // ルール（validIngredient）で許した項目だけを書く
  const extra = Object.fromEntries((["gramsPerPiece", "gramsPerMl", "labelName", "isAdditive", "supplier", "photoPath", "priceTax", "allergensConfirmed", "aliases", "priceSource"] as const)
    .flatMap((k) => (d[k] !== undefined ? [[k, d[k]]] : [])));
  await saveDoc(`${path}/${id}`, {
    name: d.name.slice(0, 60), purchasePrice: d.purchasePrice ?? null, purchaseQty: d.purchaseQty ?? 1, purchaseUnit: d.purchaseUnit ?? "kg",
    allergens: d.allergens ?? [], globalRef: d.globalRef ?? null, createdBy: uid, ...extra,
  }, { merge: false });
  return id;
}

/** 名寄せの結果から、店舗の材料の id を返す（無ければ作る） */
export async function linkIngredient(orgId: string, uid: string, m: Pick<ItemMatch, "kind" | "id" | "name">, rawName: string, own: Ingredient[]): Promise<string> {
  if (m.kind === "tenant" && m.id) return m.id;
  if (m.kind === "global" && m.id) {
    const same = own.find((i) => i.globalRef === m.id);
    if (same) return same.id;
    const g = await getOnce<GlobalIngredient>(`globalIngredients/${m.id}`);
    const name = g?.name ?? m.name ?? rawName;
    // 共有の材料に参考価格があれば、仕入れ値が決まるまでの目安として入れる（「参考価格」の印付き）
    return createIngredient(orgId, uid, { name, allergens: suggestAllergens([], `${rawName} ${name}`, g?.allergens ?? []), globalRef: m.id, ...refPricePatch({ purchasePrice: null }, g) });
  }
  // 名前からアレルゲンを推定して入れておく（確かめるまでは「未確認」。ラベルの前に確かめてもらう）
  return createIngredient(orgId, uid, { name: rawName, allergens: suggestAllergens([], rawName) });
}
