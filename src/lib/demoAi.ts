// デモモードの「にせのAI」。本番の Gemini の代わりに、決まった手順で同じ形の答えを返す。
// クレジットは本番と同じように引かれる（押す前の表示 → 残高が減る → 通帳に残る、を試せるように）。
import { aiMatchCredits, priceSearchCredits, sizeSearchCredits, splitForImport } from "@shared/credits";
import type { ImportDoc, ItemMatch, ParsedRecipe } from "@shared/importTypes";
import { buildIndex, rankCandidates, toMatchKey } from "@shared/matchKey";
import { sizeFromName } from "@shared/invoice";
import { NO_MATCH, resolveLocal } from "@shared/resolveLocal";
import { parseUnit, type Unit } from "@shared/units";
import { demoGet, demoListDocs, demoWrite } from "./demo";
import { DEMO_ORG } from "./demoData";
import { demoIngredientMap, demoWithCredits, demoWriteRecipe } from "./demoFunctions";

/** デモのAIが知っている商品の量 */
const DEMO_SIZES: { re: RegExp; qty: number; unit: string; note: string; gpp?: number }[] = [
  { re: /(ヨツバ|よつ葉).*(食塩不使用|無塩)/, qty: 450, unit: "g", note: "よつ葉の食塩不使用は450g入り" },
  { re: /タマゴ|たまご|卵/, qty: 10, unit: "個", note: "10ｺ＝10個入り。Mは殻なし約50g", gpp: 50 },
];
import { demoInvoiceLines } from "./demoShare";

type Data = Record<string, unknown>;
const O = `organizations/${DEMO_ORG}`;
const rid = () => `demo${Math.random().toString(36).slice(2, 12)}`;

function matchInput() {
  const ingredients = [...demoIngredientMap().values()];
  const globals = demoListDocs("globalIngredients").map((x) => ({ id: x.id, name: String(x.data.name), aliases: (x.data.aliases as string[]) ?? [] }));
  return {
    ingredients,
    tenantIndex: buildIndex(ingredients.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] }))),
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
    case "readInvoices": {
      const paths = d.paths as string[];
      return demoWithCredits("invoicePhoto", paths.length, async () => {
        const lines = demoInvoiceLines(paths, [...demoIngredientMap().values()]);
        return { result: { lines, read: paths.length, photos: paths.length } as T };
      });
    }
    case "matchPurchaseLines": {
      // デモのAIは「いちばん似た名前」を選ぶだけ。一般名は書き出したアプリの推定（hints）か品名から量を除いたもの
      const names = d.names as string[];
      const hints = (d.hints as string[] | undefined) ?? [];
      const fixed = (d.fixed as boolean[] | undefined) ?? [];
      const index = buildIndex([...demoIngredientMap().values()].map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] })));
      const gIndex = matchInput().globalIndex;
      return demoWithCredits("aiMatch", aiMatchCredits(names.length), async () => ({
        result: {
          matches: names.map((n, k) => {
            const generic = hints[k] || n.replace(/[\d.]+\s*(kg|g|ml|l|個|枚|本)/gi, "").trim();
            const c = fixed[k] ? undefined : rankCandidates(generic, index, 1)[0];
            const g = fixed[k] || (c && c.score >= 0.5) ? null : rankCandidates(generic, gIndex, 1)[0];
            const printed = sizeFromName(n);
            // デモのAIが知っている決まった量（本物のAIは商品名と値段から判断する）
            const known = DEMO_SIZES.find((x) => x.re.test(n.normalize("NFKC")));
            const size = printed ? { qty: printed.qty, unit: printed.unit, size: "printed", sizeNote: "", gramsPerPiece: known?.gpp ?? null }
              : known ? { qty: known.qty, unit: known.unit, size: "known", sizeNote: known.note, gramsPerPiece: known.gpp ?? null }
              : { qty: 0, unit: "個", size: "none", sizeNote: "", gramsPerPiece: null };
            return {
              ingredientId: c && c.score >= 0.5 ? c.id : null, confidence: c ? Math.min(0.9, c.score + 0.2) : 0, ...size,
              generic, global: g && g.score >= 0.4 ? { id: g.id, name: g.name, confidence: Math.min(0.9, g.score + 0.2) } : null,
            };
          }),
        } as T,
      }));
    }
    case "compareWebPrices": {
      // デモの値段比べ：決まった見本を返す（本物は Google 検索つきのAIが売り場を探す）
      const path = `${O}/ingredients/${String(d.ingredientId)}`;
      const ing = demoGet(path);
      if (!ing) throw new Error("材料が見つかりません。");
      return demoWithCredits("priceCompare", 1, async () => {
        const offers = {
          list: [
            { shop: "製菓材料のお店A（デモ）", product: `${ing.name} 1kg`, price: 540, qty: 1, unit: "kg", url: "https://example.com/a", note: "送料別" },
            { shop: "業務用通販B（デモ）", product: `${ing.name} 業務用 3kg`, price: 1380, qty: 3, unit: "kg", url: "https://example.com/b", note: "5,000円以上で送料無料" },
            { shop: "スーパーC（デモ）", product: `${ing.name} 500g`, price: 298, qty: 500, unit: "g", url: null, note: "" },
          ],
          at: new Date().toISOString(), searchHtml: "<div style='font:12px sans-serif;padding:6px'>Google 検索の候補（デモ）</div>", picked: null,
        };
        demoWrite(path, { ...ing, offers });
        return { result: { offers } as T };
      });
    }
    case "fillPricesFromWeb": {
      // デモのネット検索：材料名から決まった目安を入れる（本物は Google 検索つきのAIがお店のページを見て調べる）
      const empty = [...demoIngredientMap().values()].filter((i) => i.purchasePrice === null);
      const web: Record<string, { price: number; qty: number; unit: string; note: string }> = {
        きび砂糖: { price: 486, qty: 1, unit: "kg", note: "製菓用・1kg袋・3店・税込486円" }, キビ糖: { price: 486, qty: 1, unit: "kg", note: "製菓用・1kg袋・3店・税込486円" },
        発酵バター: { price: 1280, qty: 450, unit: "g", note: "製菓用・450g・4店・税込1,280円" }, バニラビーンズ: { price: 980, qty: 5, unit: "本", note: "マダガスカル産・5本・3店・税込980円" },
      };
      const todo = empty.slice(0, 20);
      return demoWithCredits("priceSearch", priceSearchCredits(todo.length), async () => {
        let filled = 0;
        for (const i of todo) {
          const w = web[i.name];
          if (!w) continue;
          const path = `${O}/ingredients/${i.id}`;
          demoWrite(path, { ...demoGet(path), purchasePrice: Math.round((w.price / 1.08) * 10) / 10, priceTax: 0, purchaseQty: w.qty, purchaseUnit: w.unit, priceSource: "ref",
            refWeb: { note: w.note, sources: [{ uri: "https://example.com/price", title: "example.com（デモ）" }], searchHtml: "<div style='font:12px sans-serif;padding:6px'>Google 検索の候補（デモ）</div>" } });
          filled++;
        }
        return { result: { free: 0, filled, tried: todo.length, left: empty.length - todo.length } as T };
      });
    }
    case "searchPackSizes": {
      // デモのネット検索：知っている商品だけ見つかる（本物は Google 検索つきのAIが商品のページを探す）
      const lines = d.lines as { name: string }[];
      const results = lines.map((l) => {
        const hit = /タカナシ.*特選/.test(l.name.normalize("NFKC"));
        return hit
          ? { found: true, shared: false, qty: 200, unit: "ml", gramsPerPiece: null, sizeNote: "タカナシ 特選北海道純生クリーム47：メーカーの表記で200ml",
            sizeSources: [{ uri: "https://example.com/takanashi", title: "example.com（デモ）" }], sizeSearchHtml: "<div style='font:12px sans-serif;padding:6px'>Google 検索の候補（デモ）：タカナシ 特選北海道 内容量</div>" }
          : { found: false, shared: false, qty: 0, unit: "個", gramsPerPiece: null, sizeNote: "", sizeSources: [], sizeSearchHtml: "" };
      });
      return demoWithCredits("sizeSearch", sizeSearchCredits(lines.length), async () => ({ result: { results, searched: lines.length } as T }));
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
          confidence: 0.5, note: "デモの読み取りです（写真の中身は見ていません）。",
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
