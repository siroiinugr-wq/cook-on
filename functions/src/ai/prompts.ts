// Gemini に渡す指示と、答えの形（JSONスキーマ）。設計書 ④ と同じ文。
// 安く速くするための決まり：
// - 形の説明はスキーマに任せ、指示の文は短くする（毎回払う入力が減る）
// - 答えのキーは短くする（出力は入力の約5倍の単価）
// - 候補はサーバーで絞ってから渡し、AIには「選ぶ」だけを頼む
import { UNITS } from "../shared/units";

// ── 表記ゆれの名寄せ ──
export const MATCH_SYSTEM = `あなたは製菓・飲食店の材料名を、共有マスターの項目に対応づける係です。
各 item の name（店が書いた名前）について、candidates（id: 標準名）から同じ食材を1つ選ぶ。
- 略称・表記ゆれ・ブランド名付きは同じ食材とみなす（チョコ→チョコレート、薄力→薄力粉）。
- 種類が違うもの（無塩バターと有塩バター等）は近い方を選び、c を 0.6 未満にする。
- 当てはまる候補が無ければ id は null。候補に無い id を作らない。
- c は確からしさ 0〜1。`;

export const MATCH_SCHEMA = {
  type: "object",
  properties: {
    r: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, id: { type: ["string", "null"] }, c: { type: "number" } },
        required: ["i", "id", "c"],
      },
    },
  },
  required: ["r"],
};

export interface MatchAnswer {
  r: { i: number; id: string | null; c: number }[];
}

/** 1行1件の短い書き方にする（JSONより入力トークンが少ない） */
export function matchPrompt(items: { name: string; candidates: { id: string; name: string }[] }[]): string {
  return items.map((it, i) => `${i}. ${it.name} => ${it.candidates.map((c) => `${c.id}:${c.name}`).join(" | ")}`).join("\n");
}

// ── フォーマット不問の取り込み ──
export const IMPORT_SYSTEM = `あなたは飲食店のレシピデータを読み取り、指定のJSONに変換する係です。
入力はCSV・Excelを文字にしたもの・メモ書きなど形式がばらばらです。
- レシピごとに name・category・yield・items・steps を取り出す。分からない項目は空にする。
- items は raw（原文の材料名）、std（ブランドや形容を外した一般的な食材名）、qty（数値）、unit。
  例：「明治ブラック」→ std「チョコレート」、「よつ葉無塩」→ std「無塩バター」
- unit は ${UNITS.join(", ")} のいずれか。「少々」「適量」は qty を null、unit を「適量」にする。
- 原文にない材料・分量・工程を足さない。読めない所は notes に一言で書く。
- yield は1回分で何個できるか（数値）。書かれていなければ null。`;

/** 写真から取り込むときに足す注意（IMPORT_SYSTEM のあとに続ける） */
export const IMPORT_PHOTO_NOTE = `
入力はレシピのノート・本・カード・画面などを撮った写真です（手書きのこともあります）。
- 複数枚のときは撮った順に並んでいます。前の写真の続き（2ページ目など）なら、同じレシピとしてまとめる。
- 写真に写っていないレシピや材料を推測で足さない。にじみ・見切れで読めない所は notes に「〇枚目の右下が読めない」のように書く。
- レシピでない写真（材料の袋・店の写真など）は無視する。`;

export const IMPORT_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          yield: { type: ["number", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                raw: { type: "string" },
                std: { type: "string" },
                qty: { type: ["number", "null"] },
                unit: { type: "string", enum: [...UNITS] },
              },
              required: ["raw", "std", "qty", "unit"],
            },
          },
          steps: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
        required: ["name", "items", "steps"],
      },
    },
  },
  required: ["recipes"],
};

export interface ImportAnswer {
  recipes: {
    name: string;
    category?: string;
    yield?: number | null;
    items: { raw: string; std: string; qty: number | null; unit: string }[];
    steps: string[];
    notes?: string;
  }[];
}

// ── 既製品の原材料・成分の下書き ──
export const PRODUCT_SYSTEM = `あなたは食品の原材料表示に詳しい係です。メーカー名と商品名から、パッケージの表示を推測して下書きを作る。
- 知っている範囲で書き、分からない項目は空にする。推測で数値を作らない。
- ingredients はパッケージの「原材料名」の書き方（重量順・読点区切り）。
- allergens は特定原材料と準ずるものの名前（例：小麦、卵、乳成分、大豆）。
- nutrition は100gあたり。分からなければ省く。
- confidence は 0〜1。商品を知らなければ 0.3 未満にする。`;

export const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    ingredients: { type: "string" },
    allergens: { type: "array", items: { type: "string" } },
    nutrition: {
      type: "object",
      properties: { kcal: { type: "number" }, protein: { type: "number" }, fat: { type: "number" }, carbohydrate: { type: "number" }, salt: { type: "number" } },
    },
    confidence: { type: "number" },
    note: { type: "string" },
  },
  required: ["ingredients", "allergens", "confidence"],
};

export interface ProductAnswer {
  ingredients: string;
  allergens: string[];
  nutrition?: Record<string, number>;
  confidence: number;
  note?: string;
}

// ── 原価ダウン・新作の提案 ──
export const SUGGEST_SYSTEM = `あなたは製菓・飲食店の商品開発と原価管理の相談役です。
渡されたレシピ（材料・g・原価）と相談に対して、具体的な案を3つまで出す。
- 味や食感への影響と、手間の増減を正直に書く。品質を大きく落とす案は出さない。
- 原価の変化は、渡された単価から計算できる範囲で円で書く。分からなければ null。
- 材料を替える案は、一般に手に入る材料にする。`;

export const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          change: { type: "string" },
          effect: { type: "string" },
          costDiffYen: { type: ["number", "null"] },
          caution: { type: "string" },
        },
        required: ["title", "change", "effect"],
      },
    },
  },
  required: ["ideas"],
};

export interface SuggestAnswer {
  ideas: { title: string; change: string; effect: string; costDiffYen?: number | null; caution?: string }[];
}
