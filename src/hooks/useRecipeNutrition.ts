// レシピの栄養成分を出すための「材料 → 100gあたりの成分」。
// お店で作る材料は材料に入っている成分、ほかは結んだ共有の材料（食品成分表・既製品）の成分を1回だけ読んで覚える
import { useEffect, useMemo, useState } from "react";
import type { NutritionOf } from "@shared/nutrition";
import type { GlobalIngredient, Ingredient, Recipe } from "@shared/types";
import { getOnce } from "../lib/store";

const cache = new Map<string, Record<string, number> | null>();

export function useNutritionOf(recipes: (Pick<Recipe, "items"> | null | undefined)[], ingById: Map<string, Ingredient>): { nutOf: NutritionOf; ready: boolean } {
  const refs = useMemo(() => {
    const out = new Set<string>();
    for (const r of recipes) for (const it of r?.items ?? []) {
      const ing = it.ingredientId ? ingById.get(it.ingredientId) : undefined;
      if (ing && !ing.nutrition && ing.globalRef) out.add(ing.globalRef);
    }
    return [...out].sort();
  }, [recipes, ingById]);
  const key = refs.join("|");
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    let live = true;
    const need = refs.filter((r) => !cache.has(r));
    Promise.all(need.map(async (r) => {
      try { cache.set(r, (await getOnce<GlobalIngredient>(`globalIngredients/${r}`))?.nutrition ?? null); } catch { cache.set(r, null); }
    })).then(() => { if (live) setLoaded(key); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const nutOf = useMemo<NutritionOf>(() => (ing) => ing.nutrition ?? (ing.globalRef ? cache.get(ing.globalRef) : null) ?? null, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  return { nutOf, ready: loaded === key };
}
