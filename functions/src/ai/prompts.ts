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
- レシピごとに name・category・subcategory・yield・items・steps を取り出す。分からない項目は空にする。
- category は大きな分類（焼菓子・ケーキ・パン・和菓子・料理・ドリンクなど）、subcategory はその中の種類（パウンドケーキ・クッキー・マフィン・パスタなど）。
- items は raw（原文の材料名）、std（ブランドや形容を外した一般的な食材名）、qty（数値）、unit。
  例：「明治ブラック」→ std「チョコレート」、「よつ葉無塩」→ std「無塩バター」
- unit は ${UNITS.join(", ")} のいずれか。「少々」「適量」は qty を null、unit を「適量」にする。
- 原文にない材料・分量・工程を足さない。読めない所は notes に一言で書く。
- yield は1回分（書かれた分量のまま）で何個・何枚・何本できるか（数値）。
  「〇個分」「約〇枚」「〇cm角 〇本」「天板1枚で〇個」などの書き方からも読む。型（18cmホール型など）1台だけなら、切り分ける数が書いてあればその数、無ければ 1。
  手がかりが全く無ければ null（推測で作らない）。`;

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
          subcategory: { type: "string" },
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
    subcategory?: string;
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

// ── 既製品のパッケージの写真を読む ──
export const PRODUCT_PHOTO_SYSTEM = `あなたは食品の一括表示を書き写す係です。入力は既製品のパッケージの裏（一括表示・栄養成分表示）を撮った写真。
- 写真に書いてあることだけを書く。写っていない項目は空にし、推測で埋めない。
- maker はメーカー名（製造者・販売者）、productName は商品名（一括表示の「名称」ではなく商品名が写っていればそれ。無ければ名称）。
- ingredients は「原材料名」欄をそのまま。添加物の前の「／」や改行の区切りも元のとおり。かっこの中も省かない。
- allergens は表示にあるアレルゲン（「一部に小麦・乳成分・大豆を含む」など）を1つずつ（例：["小麦","乳成分","大豆"]）。表示が無ければ空。
- nutrition は「栄養成分表示」の数値を表示のとおりに書く。basisLabel に「100gあたり」「1枚(12g)あたり」のような基準を、basisGrams にその g 数（分からなければ null）を入れる。kcal・protein・fat・carbohydrate・salt（食塩相当量。ナトリウムだけなら mg÷1000×2.54 で g に直す）。
- 読めない・見切れている所は note に書く。confidence は 0〜1（文字がはっきり読めたら高く）。`;

export const PRODUCT_PHOTO_SCHEMA = {
  type: "object",
  properties: {
    maker: { type: "string" },
    productName: { type: "string" },
    ingredients: { type: "string" },
    allergens: { type: "array", items: { type: "string" } },
    basisLabel: { type: "string" },
    basisGrams: { type: ["number", "null"] },
    nutrition: {
      type: "object",
      properties: { kcal: { type: "number" }, protein: { type: "number" }, fat: { type: "number" }, carbohydrate: { type: "number" }, salt: { type: "number" } },
    },
    confidence: { type: "number" },
    note: { type: "string" },
  },
  required: ["maker", "productName", "ingredients", "allergens", "confidence"],
};

export interface ProductPhotoAnswer {
  maker: string;
  productName: string;
  ingredients: string;
  allergens: string[];
  basisLabel?: string;
  basisGrams?: number | null;
  nutrition?: Record<string, number>;
  confidence: number;
  note?: string;
}

// ── 原価ダウン・新作の提案 ──
// ── ラベル（一括表示）の原材料名 ──
export const LABEL_NAME_SYSTEM = `あなたは食品表示基準に詳しい係です。製菓店・飲食店が使う材料の名前（お店の呼び方）を、一括表示の「原材料名」に書く一般的な名称に直す。
- 一般的な名称にする。例：薄力粉→小麦粉、全卵→鶏卵、発酵バター→バター、キビ糖→きび砂糖、グラニュー糖→砂糖、生クリーム→クリーム（乳製品）、BP→ベーキングパウダー
- 商品名・ブランド名・産地・規格（35%・有塩など）は外す。ただし「洋酒」「植物油脂」のような決まった書き方があればそれを使う。
- 添加物（膨張剤・乳化剤・香料・ゲル化剤・着色料・酸味料・増粘剤・pH調整剤など）は additive を true にし、label は用途名か物質名（ベーキングパウダー→膨張剤、バニラエッセンス→香料）。
- 既製品で中身が分かるもの（チョコレートなど）は名前だけにする（中身は店が書く）。
- 分からないときは元の名前のまま返し、c を低くする。`;

export const LABEL_NAME_SCHEMA = {
  type: "object",
  properties: {
    r: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, label: { type: "string" }, additive: { type: "boolean" }, c: { type: "number" } },
        required: ["i", "label", "additive", "c"],
      },
    },
  },
  required: ["r"],
};

export interface LabelNameAnswer {
  r: { i: number; label: string; additive: boolean; c: number }[];
}

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

/** Google 検索つきで今の値段を調べる（材料1つずつ。答えは JSON の文で返させる） */
export const PRICE_SEARCH_SYSTEM = `あなたは日本の製菓店・カフェの仕入れに詳しい係です。Google 検索で、日本で今買える値段を調べて、材料の値段の目安を答える。
- 製菓材料店・業務用の通販・スーパーなど、いくつかのお店の値段を見る。1つのお店の値段や、セール・送料込み・まとめ買いの値段に引っぱられない。
- よく売られている1つの包装の量（qty と unit。unit は g・kg・ml・l・個 のどれか）を決め、その包装のふつうの値段（税込の円）を price にする。見たお店の値段の真ん中くらい。
- n は値段を見たお店の数。basis に何を想定したかを短く書く（例：製菓用・1kg袋・製菓材料店3店）。商品名・お店の名前は書かない。
- 見つからない・値段の幅が大きすぎるときは c を低く（0.3以下）、材料でないものは price を 0。
- 答えは次の JSON だけを書く：{"price": 数, "qty": 数, "unit": "kg", "basis": "…", "n": 数, "c": 0〜1}`;

export interface PriceSearchAnswer {
  price: number; qty: number; unit: string; basis: string; n: number; c: number;
}


/** 包装の量・1個の重さ・根拠の決め方（レシートの写真・仕入れ明細ファイルで共通） */
const SIZE_RULES = `- 量の根拠 sb：品名・明細に量が書いてあれば "printed"。書いていなくても、ブランドと商品名から決まった内容量を知っていれば "known"（例：よつ葉バター食塩不使用 → 450g、明治おいしい牛乳 → 900ml。容量違いがあれば値段に合うほう）。値段と種類から量を推し量るしかなければ "price"（例：業務用の小麦粉で3,000円台 → 25kg袋が多い）。見当がつかなければ "none"（qty 1・unit 個）。知らない量を作らない。
- sn は量を決めた理由をひとこと（30字まで。例：「よつ葉食塩不使用は450g入り」「6P＝6個入り」）。printed なら空でよい。
- unit が 個・枚・本 のときは、gpp に1つの重さ（g）の目安を入れる（卵Mは殻を除いて約50g、卵Lは約55g、板チョコ1枚は約50g、ポーションバター1個は約8g）。分からない・食材でなければ 0。重さで量れるもの（g・kg・ml・l）は 0。
- 「お店の材料」の前回の量と値段が渡されたときは、100gあたりがかけ離れない読みかを確かめる（450gを1個、1kgを1gと読んでいないか）。`;

export const INVOICE_SYSTEM = `あなたは製菓店・飲食店の仕入れ担当です。レシート・納品書・請求書の写真から、食材と資材の明細を読み取る。
- 1行ずつ lines に入れる。小計・合計・値引き・ポイント・送料・袋代・預り金・お釣りの行は入れない。
- price は「1つあたり」の値段（円）。数量が2以上で金額しか無ければ、金額÷数量にする。
- count は買った数。qty と unit は1つの包装の量（「1kg」なら 1・kg、「500g×2」なら qty 500・unit g・count 2）。量が書いていなければ qty 1・unit 個。unit は g・kg・ml・l・個・枚・本 のどれか。
- tax は price に含まれている消費税の率。レシートの「内税」「税込」なら 0.08（食品）か 0.1（それ以外・酒類）。「外税」「税抜」「本体価格」なら 0。軽減税率の印（※・★・軽 など）があれば 0.08。
- supplier はお店・仕入れ先の名前、date は日付（YYYY-MM-DD。無ければ空）。
- ingredient には、下の「お店の材料」の一覧から同じ材料の番号を選ぶ。商品名・ブランド・規格が違っても同じ材料なら選ぶ（例：よつ葉バター食塩不使用 450g → 無塩バター）。違う材料（発酵バターと無塩バター、薄力粉と強力粉など）は選ばない。無ければ -1。c は選んだ自信（0〜1）。
- generic は一般的な材料名（食品成分表で探せる名前。例：ﾊｸﾘｷｺ 1KG → 薄力粉、よつ葉バター食塩不使用 → 無塩バター、ｸﾞﾗﾆｭｰﾄｳ → グラニュー糖）。ブランド・量は入れない。食材でないもの（袋・資材・文房具）は空。
- 読めない文字は推測しない。読めない行は入れない。
${SIZE_RULES}`;

export const INVOICE_SCHEMA = {
  type: "object",
  properties: {
    supplier: { type: "string" },
    date: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, price: { type: "number" }, count: { type: "number" }, qty: { type: "number" }, unit: { type: "string" },
          tax: { type: "number" }, ingredient: { type: "integer" }, c: { type: "number" }, generic: { type: "string" },
          sb: { type: "string", enum: ["printed", "known", "price", "none"] }, sn: { type: "string" }, gpp: { type: "number" },
        },
        required: ["name", "price", "count", "qty", "unit", "tax", "ingredient", "c", "generic", "sb", "sn", "gpp"],
      },
    },
  },
  required: ["supplier", "date", "lines"],
};

export interface InvoiceAnswer {
  supplier: string;
  date: string;
  lines: ({ name: string; price: number; count: number; qty: number; unit: string; tax: number; ingredient: number; c: number; generic?: string } & SizeAnswer)[];
}

export const PURCHASE_MATCH_SYSTEM = `あなたは製菓店・飲食店の仕入れ担当です。仕入れ明細の品名（レシートの表記）ごとに、下の「お店の材料」から同じ材料の番号を選ぶ。
- 商品名・ブランド・規格・半角カナ・略し方が違っても同じ材料なら選ぶ（例：ﾖﾂﾊﾞﾊﾞﾀｰ食塩不使用450 → 無塩バター、ﾊｸﾘｷｺ → 薄力粉）。
- 違う材料（発酵バターと無塩バター、薄力粉と強力粉、グラニュー糖と上白糖など）は選ばない。食材・資材でないもの（文房具・洗剤など）や、迷うものは -1。
- c は選んだ自信（0〜1）。
- qty と unit は「1つあたりの値段」で買える量（「450g」なら 450・g、「1L」なら 1・l、「200ml×3」の3本パックなら 600・ml、「10個入」なら 10・個）。unit は g・kg・ml・l・個・枚・本 のどれか。
- generic は一般的な材料名（食品成分表で探せる名前。例：ﾊｸﾘｷｺ 1KG → 薄力粉、よつ葉バター食塩不使用 → 無塩バター、ｸﾞﾗﾆｭｰﾄｳ → グラニュー糖）。ブランド・量は入れない。食材でないもの（袋・資材・文房具）は空。
- 品名のあとの［］は手がかり（書き出したアプリの推定した一般名・1つの値段・数量・店・いまの量の読み・お店の材料の前回の量と値段）。一般名が違っていれば直す。
- 「結び先は決まっています」と書いた行は量だけ答える（ingredient は -1 でよい）。
- 答えは lines に、聞かれた行と同じ番号（n）で入れる。
${SIZE_RULES}`;

export const PURCHASE_MATCH_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" }, ingredient: { type: "integer" }, c: { type: "number" }, qty: { type: "number" }, unit: { type: "string" }, generic: { type: "string" },
          sb: { type: "string", enum: ["printed", "known", "price", "none"] }, sn: { type: "string" }, gpp: { type: "number" },
        },
        required: ["n", "ingredient", "c", "qty", "unit", "generic", "sb", "sn", "gpp"],
      },
    },
  },
  required: ["lines"],
};

export interface PurchaseMatchAnswer {
  lines: ({ n: number; ingredient: number; c: number; qty: number; unit: string; generic?: string } & SizeAnswer)[];
}

/** AIが答える量の根拠（sb）・理由（sn）・1つの重さ（gpp） */
export interface SizeAnswer {
  sb?: string;
  sn?: string;
  gpp?: number;
}
