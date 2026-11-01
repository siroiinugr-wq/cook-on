// お店の材料から、共有の材料への提案を作る（globalSuggestions。運営が精査して採用したものだけ共有に入る）。
// 出すのは「お店がアレルゲンを確かめた材料」だけ。参考価格を写しただけの値段は出さない（元が共有の値段なので）。
import { sortAllergens } from "./allergens";
import { toMatchKey } from "./matchKey";
import type { GlobalIngredient, GlobalSuggestion, Ingredient } from "./types";

export type SuggestionDraft = Omit<GlobalSuggestion, "id" | "status" | "orgId" | "orgName" | "ingredientId" | "source" | "updatedAt">;

export function buildSuggestion(ing: Ingredient, g: GlobalIngredient | null): SuggestionDraft | null {
  if (ing.allergensConfirmed !== true || !ing.name.trim()) return null;
  const price = ing.purchasePrice !== null && ing.priceSource !== "ref" && ing.purchasePrice > 0
    ? { price: ing.purchasePrice, qty: ing.purchaseQty, unit: ing.purchaseUnit, ...(ing.supplier ? { supplier: ing.supplier.slice(0, 60) } : {}) }
    : null;
  const mine = sortAllergens(ing.allergens ?? []);
  const names = [ing.name, ...(ing.aliases ?? [])].map((x) => x.trim()).filter(Boolean);
  if (!g) {
    return finish({ kind: "new", globalId: null, globalName: "", name: ing.name.trim(), aliases: (ing.aliases ?? []).slice(0, 20), allergens: mine, labelName: ing.labelName ?? "", price, note: "" });
  }
  const known = new Set([g.name, ...(g.aliases ?? [])].map(toMatchKey));
  const aliases = [...new Set(names.filter((n) => !known.has(toMatchKey(n))))].slice(0, 20);
  const theirs = sortAllergens(g.allergens ?? []);
  const allergens = mine.join() === theirs.join() ? null : mine;
  if (!aliases.length && !allergens && !price) return null;
  return finish({ kind: "update", globalId: g.id, globalName: g.name, name: ing.name.trim(), aliases, allergens, labelName: ing.labelName ?? "", price, note: "" });
}

function finish(d: Omit<SuggestionDraft, "sig">): SuggestionDraft {
  return { ...d, sig: JSON.stringify([d.kind, d.globalId, d.name, d.aliases, d.allergens, d.price?.price ?? null, d.price?.qty ?? null, d.price?.unit ?? null]) };
}

/** 採用した値段（税抜）を、共有の参考価格（税込で持つ）に直す */
export function suggestionRefPrice(s: Pick<GlobalSuggestion, "source" | "name" | "price" | "note">, asOf: string) {
  if (!s.price) return null;
  const shop = s.source === "shop";
  return {
    price: Math.round(s.price.price * 1.08),
    qty: s.price.qty,
    unit: s.price.unit,
    item: shop ? `${s.name}（お店の仕入れ値）` : `${s.name}（AIの推定）`,
    area: shop ? "COOK ON を使うお店" : "全国の目安",
    asOf,
    source: shop ? "COOK ON のお店の仕入れ値（運営が確認）" : "AIの推定（運営が確認）",
  };
}
