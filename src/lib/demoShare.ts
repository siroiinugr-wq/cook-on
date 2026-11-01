// デモモードの「共有の材料への提案」と運営の精査（本番は functions/src/global/suggestions.ts）。同じ名前・同じ引数・同じ返り値
import { sortAllergens, type AllergenId } from "@shared/allergens";
import { buildSuggestion, suggestionRefPrice } from "@shared/suggest";
import type { GlobalIngredient, GlobalSuggestion, Ingredient } from "@shared/types";
import { demoGet, demoListDocs, demoWrite, onDemoWrite } from "./demo";
import { DEMO_ORG } from "./demoData";

type Data = Record<string, unknown>;
const month = () => new Date().toISOString().slice(0, 7);

/** 本番のトリガ onIngredientShared と同じ：設定がオンのお店で、確かめた材料が変わったら提案を作る */
onDemoWrite((path, _before, after) => {
  const m = /^organizations\/([^/]+)\/ingredients\/([^/]+)$/.exec(path);
  if (!m || !after) return;
  const org = demoGet(`organizations/${m[1]}`);
  if ((org?.settings as Data | undefined)?.shareIngredients !== true) return;
  const ing = { ...(after as unknown as Ingredient), id: m[2] };
  const gd = ing.globalRef ? demoGet(`globalIngredients/${ing.globalRef}`) : null;
  if (ing.globalRef && !gd) return;
  const draft = buildSuggestion(ing, gd ? { ...(gd as unknown as GlobalIngredient), id: ing.globalRef! } : null);
  if (!draft) return;
  const sp = `globalSuggestions/${m[1]}_${m[2]}`;
  if (demoGet(sp)?.sig === draft.sig) return;
  demoWrite(sp, { ...draft, source: "shop", status: "pending", orgId: m[1], orgName: String(org?.name ?? ""), ingredientId: m[2], updatedAt: new Date().toISOString() });
});

export function demoShareCall(name: string, d: Data): unknown | undefined {
  if (name === "estimateRefPrices") {
    const targets = demoListDocs("globalIngredients").filter((x) => ["base", "shop", "ugc"].includes(String(x.data.source)) && !x.data.refPrice).slice(0, 100);
    for (const t of targets.slice(0, 8)) {
      // デモのAI：名前の長さから値段らしい数を作るだけ
      const price = 300 + (String(t.data.name).length * 137) % 900;
      const s: Omit<GlobalSuggestion, "id"> = {
        source: "ai", kind: "update", status: "pending", orgId: null, orgName: "AIの推定", ingredientId: null, globalId: t.id, globalName: String(t.data.name),
        name: String(t.data.name), aliases: [], allergens: null, labelName: "", price: { price: Math.round(price / 1.08), qty: 1, unit: "kg" },
        note: `デモの推定・製菓用1kg・自信 50%・税込 ${price}円`, sig: `ai:${price}`, updatedAt: new Date().toISOString(),
      };
      demoWrite(`globalSuggestions/ai_${t.id}`, s as unknown as Data);
    }
    return { made: Math.min(8, targets.length), checked: targets.length };
  }
  if (name === "reviewSuggestion") {
    const sp = `globalSuggestions/${d.id}`;
    const cur = demoGet(sp);
    if (!cur) throw new Error("提案が見つかりません。");
    const s = { ...(cur as unknown as GlobalSuggestion), id: String(d.id) };
    if (!d.accept) {
      demoWrite(sp, { ...cur, status: "rejected" });
      return { globalId: null };
    }
    const aliases = ((d.aliases as string[]) ?? s.aliases).filter(Boolean);
    const allergens = d.allergens === null ? null : sortAllergens(((d.allergens as AllergenId[]) ?? s.allergens ?? []));
    const refPrice = d.usePrice ? suggestionRefPrice(s, month()) : null;
    let globalId = s.globalId;
    if (s.kind === "new") {
      globalId = `shop_demo${Math.random().toString(36).slice(2, 8)}`;
      const nm = String(d.name ?? s.name).trim();
      demoWrite(`globalIngredients/${globalId}`, { name: nm, aliases: aliases.filter((a) => a !== nm), category: String(d.category ?? "お店から"), allergens: allergens ?? [], source: "shop", ...(refPrice ? { refPrice } : {}) });
      if (s.orgId === DEMO_ORG && s.ingredientId) {
        const ip = `organizations/${DEMO_ORG}/ingredients/${s.ingredientId}`;
        const ing = demoGet(ip);
        if (ing) demoWrite(ip, { ...ing, globalRef: globalId });
      }
    } else {
      const gp = `globalIngredients/${globalId}`;
      const g = demoGet(gp);
      if (!g) throw new Error("共有の材料が見つかりません。");
      demoWrite(gp, { ...g, aliases: [...new Set([...((g.aliases as string[]) ?? []), ...aliases])].filter((a) => a !== g.name), ...(allergens ? { allergens } : {}), ...(refPrice ? { refPrice } : {}) });
    }
    demoWrite(sp, { ...cur, status: "accepted", globalId });
    return { globalId };
  }
  return undefined;
}
