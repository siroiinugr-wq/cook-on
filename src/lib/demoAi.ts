// デモモードの「にせのAI」。本番の Gemini の代わりに、決まった手順で同じ形の答えを返す。
// クレジットは本番と同じように引かれる（押す前の表示 → 残高が減る → 通帳に残る、を試せるように）。
import { aiMatchCredits, splitForImport } from "@shared/credits";
import type { ImportDoc, ItemMatch, ParsedRecipe } from "@shared/importTypes";
import { buildIndex, toMatchKey } from "@shared/matchKey";
import { NO_MATCH, resolveLocal } from "@shared/resolveLocal";
import { parseUnit, type Unit } from "@shared/units";
import { demoGet, demoListDocs, demoWrite } from "./demo";
import { DEMO_ORG } from "./demoData";
import { demoIngredientMap, demoWithCredits, demoWriteRecipe } from "./demoFunctions";

type Data = Record<string, unknown>;
const O = `organizations/${DEMO_ORG}`;
const rid = () => `demo${Math.random().toString(36).slice(2, 12)}`;

function matchInput() {
  const ingredients = [...demoIngredientMap().values()];
  const globals = demoListDocs("globalIngredients").map((x) => ({ id: x.id, name: String(x.data.name), aliases: (x.data.aliases as string[]) ?? [] }));
  return {
    ingredients,
    tenantIndex: buildIndex(ingredients.map((i) => ({ id: i.id, name: i.name, aliases: [] }))),
    aliases: new Map(demoListDocs(`${O}/aliases`).map((x) => [x.id, String(x.data.globalId)])),
    globalIndex: buildIndex(globals),
    globalById: new Map(globals.map((g) => [g.id, g])),
  };
}

/** AIの代わり：候補の1位を選び、自信を少し上げる */
function resolve(names: string[], useAi: boolean): ItemMatch[] {
  const input = matchInput();
  const { results, pending } = resolveLocal(input, names, useAi);
  for (const p of pending) {
    const top = p.candidates[0];
    results.set(p.key, top ? { kind: "global", id: top.id, name: top.name, confidence: 0.8, via: "ai", candidates: p.candidates } : { ...NO_MATCH, candidates: p.candidates });
  }
  return names.map((n) => results.get(toMatchKey(n)) ?? NO_MATCH);
}

/** 取り込みの読み取りの代わり：CSV（1行1材料）か、空行で区切ったメモ書きを読む */
function demoParse(text: string): ParsedRecipe[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const csv = lines.filter((l) => /[,\t]/.test(l));
  if (csv.length >= lines.filter(Boolean).length * 0.6) {
    const map = new Map<string, ParsedRecipe>();
    for (const l of csv) {
      const c = l.split(/[,\t]/).map((x) => x.trim().replace(/^"|"$/g, ""));
      const qty = Number(c[2]);
      if (c.length < 3 || !c[1] || !Number.isFinite(qty)) continue; // 見出しの行など
      const r = map.get(c[0]) ?? { name: c[0], category: "", pieces: null, items: [], steps: [], notes: "" };
      r.items.push(item(c[1], qty, c[3] ?? "g"));
      map.set(c[0], r);
    }
    return [...map.values()];
  }
  const out: ParsedRecipe[] = [];
  let cur: ParsedRecipe | null = null;
  for (const l of lines) {
    if (!l) { cur = null; continue; }
    if (!cur) {
      cur = { name: l.replace(/^[■【［[]|[】］\]]$/g, ""), category: "", pieces: null, items: [], steps: [], notes: "" };
      out.push(cur);
      continue;
    }
    const m = /^(.+?)[\s　:：・]+([\d.]+)\s*([^\d\s]*)$/.exec(l);
    if (m && !/^\d+[.．)）]/.test(l)) cur.items.push(item(m[1], Number(m[2]), m[3] || "g"));
    else if (/適量|少々/.test(l)) cur.items.push(item(l.replace(/[\s　]*(適量|少々)/, ""), null, "適量"));
    else cur.steps.push(l.replace(/^\d+[.．)）]\s*/, ""));
  }
  return out.filter((r) => r.items.length || r.steps.length);
}

function item(raw: string, qty: number | null, unitRaw: string) {
  const unit: Unit = parseUnit(unitRaw) ?? "g";
  return { raw, std: raw.replace(/[（(].*?[）)]/g, "").trim(), qty, unit, match: NO_MATCH };
}

export async function demoAiCall<T>(name: string, d: Data): Promise<T> {
  switch (name) {
    case "suggestIngredients":
      return { matches: resolve(d.names as string[], false) } as T;
    case "aiMatchIngredients": {
      const names = d.names as string[];
      return demoWithCredits("aiMatch", aiMatchCredits(names.length), async () => ({ result: { matches: resolve(names, true) } as T }));
    }
    case "parseImport": {
      const text = String(d.text ?? "");
      const chunks = splitForImport(text);
      if (!chunks.length) throw new Error("ファイルに文字が見つかりませんでした。");
      return demoWithCredits("importChunk", chunks.length, async () => {
        const recipes = demoParse(text);
        if (!recipes.length) throw new Error("レシピを読み取れませんでした（デモの読み取りは簡易版です）。クレジットは使われていません。");
        const matches = resolve(recipes.flatMap((r) => r.items.map((i) => i.std || i.raw)), true);
        let k = 0;
        recipes.forEach((r) => r.items.forEach((i) => { i.match = matches[k++]; }));
        const id = rid();
        const doc: ImportDoc = { status: "preview", fileName: String(d.fileName ?? ""), chars: text.length, chunks: chunks.length, failedChunks: [], creditsUsed: chunks.length, recipes, createdBy: "demo-user" };
        demoWrite(`${O}/imports/${id}`, { ...doc, createdAt: new Date().toISOString() });
        return { result: { importId: id, recipes: recipes.length, failedChunks: [] } as T };
      });
    }
    case "parseImportPhotos": {
      // デモでは写真を読めないので、写真の枚数ぶんのクレジットで見本のレシピを1件返す
      const n = (d.paths as string[]).length;
      return demoWithCredits("importPhoto", n, async () => {
        const recipes = demoParse("写真のレシピ（デモの見本）\n薄力粉 100g\n無塩バター 80g\nグラニュー糖 60g\n卵 1個");
        const matches = resolve(recipes.flatMap((r) => r.items.map((i) => i.std || i.raw)), true);
        let k = 0;
        recipes.forEach((r) => r.items.forEach((i) => { i.match = matches[k++]; }));
        const id = rid();
        const doc: ImportDoc = { status: "preview", fileName: `写真 ${n}枚`, chars: 0, chunks: n, photos: n, failedChunks: [], creditsUsed: n, recipes, createdBy: "demo-user" };
        demoWrite(`${O}/imports/${id}`, { ...doc, createdAt: new Date().toISOString() });
        return { result: { importId: id, recipes: recipes.length, failedChunks: [] } as T };
      });
    }
    case "commitImport": {
      const path = `${O}/imports/${d.importId}`;
      const imp = demoGet(path);
      if (!imp || imp.status !== "preview") throw new Error("この取り込みは保存できる状態ではありません。");
      const ids: string[] = [];
      for (const r of (d.recipes as ParsedRecipe[]).filter((x) => !x.skip)) {
        const items = r.items.map((it) => ({ ingredientId: ensureIngredient(it.std || it.raw, it.match), name: it.match.name ?? (it.std || it.raw), qty: it.qty, unit: it.unit }));
        ids.push(demoWriteRecipe(null, { name: r.name, category: r.category, tags: ["取り込み"], items, steps: r.steps.map((text) => ({ text })), yield: { pieces: r.pieces ?? 1 } }).recipeId);
      }
      demoWrite(path, { ...imp, status: "saved", savedRecipeIds: ids, recipes: d.recipes });
      return { saved: ids.length } as T;
    }
    case "readProductPhoto": {
      const paths = (d.paths as string[]) ?? [];
      return demoWithCredits("productPhoto", paths.length, async () => ({
        result: {
          maker: "デモ製菓", productName: "製菓用スイートチョコ", ingredientsText: "砂糖、カカオマス、ココアバター、全粉乳／乳化剤（大豆由来）、香料",
          allergens: ["milk", "soy"], nutrition: { kcal: 548, protein: 5.2, fat: 33.1, carbohydrate: 56.4, salt: 0.05 }, basisLabel: "100gあたり",
          photoPath: paths[0], confidence: 0.5, note: "デモの読み取りです（写真の中身は見ていません）。",
        } as T,
      }));
    }
    case "guessProduct":
      return demoWithCredits("productGuess", 1, async () => ({
        result: { ingredientsText: "砂糖、カカオマス、全粉乳、ココアバター／乳化剤（大豆由来）、香料", allergens: ["milk", "soy"], nutrition: { kcal: 560 }, confidence: 0.4, note: "デモの下書きです。パッケージの表示で必ず確かめてください。" } as T,
      }));
    case "aiSuggest":
      return demoWithCredits("aiSuggest", 1, async () => ({
        result: { ideas: [
          { title: "アーモンドプードルの一部を薄力粉に", change: "アーモンドプードル50gのうち15gを薄力粉に替える", effect: "風味は少し軽くなるが、焼き色と形は保てる", costDiffYen: -24, caution: "しっとり感が落ちるので焼き時間を1分短く" },
          { title: "焦がしバターを一部サラダ油に", change: "バター120gのうち20gを米油に替える", effect: "香りは控えめになるが、翌日の固さが出にくい", costDiffYen: -48, caution: "ラベルの原材料が変わる" },
        ] } as T,
      }));
    default:
      throw new Error(`デモモードでは「${name}」は使えません。`);
  }
}

/** 取り込みで使う材料を探す・無ければ作る（本番の recipes/importSave.ts と同じ順） */
function ensureIngredient(name: string, m: ItemMatch): string | null {
  const map = demoIngredientMap();
  if (m.kind === "tenant" && m.id && map.has(m.id)) return m.id;
  const byGlobal = m.kind === "global" && m.id ? [...map.values()].find((i) => i.globalRef === m.id) : undefined;
  if (byGlobal) return byGlobal.id;
  const sameName = [...map.values()].find((i) => toMatchKey(i.name) === toMatchKey(m.name ?? name));
  if (sameName) return sameName.id;
  const g = m.kind === "global" && m.id ? demoGet(`globalIngredients/${m.id}`) : null;
  const id = rid();
  demoWrite(`${O}/ingredients/${id}`, {
    name: g ? String(g.name) : name, purchasePrice: null, purchaseQty: 1, purchaseUnit: "kg",
    allergens: (g?.allergens as string[]) ?? [], globalRef: g ? m.id : null, createdAt: new Date().toISOString(),
  }, false);
  return id;
}
