// 文部科学省「日本食品標準成分表」の Excel（第2章のデータ）を、共有マスター globalIngredients の形に直す。
// 本番に書くのは scripts/import-mext.mjs。ここは形を直すだけ（テストできるよう Firestore に触らない）。
//
// 列は見出しの文字で探す（列の位置は版ごとに少し動くため）。
// - 「食品番号」「食品名」の見出しがある行 … 番号と名前の列
// - 「ENERC_KCAL」などの成分識別子が並ぶ行 … 成分の列。この行より下がデータ
// 値の書き方：Tr（微量）→ 0、(0)・(12.3)（推定値）→ かっこを外した数、-（未測定）→ 入れない
//
// 利用条件：成分表のデータは自由に使ってよいが、アプリでも出典を書く（文部科学省の案内）。画面は MEXT_CREDIT を出す。
import type { AllergenId } from "./allergens";

export const MEXT_EDITION = "日本食品標準成分表（八訂）増補2023年";
export const MEXT_CREDIT = `成分値の出典：文部科学省「${MEXT_EDITION}」`;

export interface MextFood {
  code: string;
  name: string;
  aliases: string[];
  category: string;
  allergens: AllergenId[];
  /** 100g あたり */
  nutrition: Record<string, number>;
}

/** 保存する成分（キー → 成分識別子。先にあるほうを使う）。kcal〜salt は食品表示の栄養成分表示と同じ5つ */
export const MEXT_NUTRIENTS: Record<string, string[]> = {
  kcal: ["ENERC_KCAL"],
  protein: ["PROT-", "PROTCAA"],
  fat: ["FAT-", "FATNLEA"],
  carbohydrate: ["CHOCDF-"],
  salt: ["NACL_EQ"],
  fiber: ["FIB-"],
  water: ["WATER"],
};

export const NUTRIENT_LABELS: Record<string, string> = {
  kcal: "エネルギー", protein: "たんぱく質", fat: "脂質", carbohydrate: "炭水化物", salt: "食塩相当量", fiber: "食物繊維", water: "水分",
};

const GROUPS: Record<string, string> = {
  "01": "穀類", "02": "いも及びでん粉類", "03": "砂糖及び甘味類", "04": "豆類", "05": "種実類", "06": "野菜類",
  "07": "果実類", "08": "きのこ類", "09": "藻類", "10": "魚介類", "11": "肉類", "12": "卵類", "13": "乳類",
  "14": "油脂類", "15": "菓子類", "16": "し好飲料類", "17": "調味料及び香辛料類", "18": "調理済み流通食品類",
};

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, "").trim());

/** 成分表の値を数にする。測っていない（-）や読めないものは null */
export function parseMextValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").normalize("NFKC").replace(/[()\s]/g, "");
  if (!s || s === "-" || s === "*" || s === "†") return null;
  if (/^tr$/i.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 表示用の名前。「こむぎ　［小麦粉］　薄力粉　１等」→「こむぎ ［小麦粉］ 薄力粉 1等」 */
export function cleanMextName(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim()
    .replace(/\[/g, "［").replace(/\]/g, "］").replace(/</g, "＜").replace(/>/g, "＞").replace(/\(/g, "（").replace(/\)/g, "）");
}

// 名前の最後につく「状態」。別名を作るときに外す（「全卵 生」→「全卵」）
const STATE_WORDS = new Set(["生", "乾", "ゆで", "焼き", "蒸し", "揚げ", "水煮", "1等", "2等", "特等", "市販品", "冷凍", "缶詰"]);

/** 探しやすくするための別名（照合キーではかっこの中が消えるので、かっこの中身を外に出したものも作る） */
export function mextAliases(name: string): string[] {
  const segs = name.split(" ").filter((s) => !/^[＜（].*[＞）]$/.test(s));
  const bi = segs.findIndex((s) => /^［.*］$/.test(s));
  const tail = bi >= 0 ? segs.slice(bi + 1) : segs.slice(1);
  const core = [...tail];
  while (core.length > 1 && STATE_WORDS.has(core[core.length - 1])) core.pop();
  const out = [
    segs.map((s) => s.replace(/^［(.*)］$/, "$1")).join(" "),
    tail.join(" "),
    core.join(" "),
    bi >= 0 && tail.length ? `${segs[bi].slice(1, -1)} ${core.join(" ")}` : "",
  ].map((s) => s.trim()).filter((s) => s.replace(/\s/g, "").length >= 2 && s !== name);
  return [...new Set(out)].slice(0, 4);
}

// 成分表にアレルゲンの列は無いので、食品群と名前から推定する（多めに付く向き。画面は「お店で確かめて」と出す）
const ALLERGEN_RULES: { id: AllergenId; re: RegExp; groups?: string[] }[] = [
  { id: "egg", re: /./, groups: ["12"] },
  { id: "milk", re: /./, groups: ["13"] },
  { id: "milk", re: /バター|チーズ|生クリーム|ミルク|乳/, groups: ["14", "15"] },
  { id: "wheat", re: /こむぎ|小麦|パン|うどん|そうめん|ひやむぎ|中華めん|マカロニ|スパゲッティ|ふ類|麩|ぎょうざの皮|しゅうまいの皮|ビスケット|クラッカー|カステラ|ドーナッツ/ },
  { id: "buckwheat", re: /そば/, groups: ["01"] },
  { id: "soy", re: /だいず|大豆|豆乳|とうふ|豆腐|納豆|油揚げ|きな粉|おから|ゆば|湯葉|みそ|しょうゆ/ },
  { id: "peanut", re: /らっかせい|落花生|ピーナッツ/ },
  { id: "sesame", re: /ごま/ },
  { id: "almond", re: /アーモンド/ },
  { id: "walnut", re: /くるみ/ },
  { id: "cashew", re: /カシューナッツ/ },
  { id: "macadamia", re: /マカダミア/ },
  { id: "banana", re: /バナナ/ },
  { id: "apple", re: /りんご/ },
  { id: "orange", re: /オレンジ/ },
  { id: "kiwi", re: /キウイ/ },
  { id: "peach", re: /もも|白桃|黄桃/, groups: ["07"] },
  { id: "shrimp", re: /えび/, groups: ["10"] },
  { id: "crab", re: /かに|がに/, groups: ["10"] },
  { id: "squid", re: /いか/, groups: ["10"] },
  { id: "salmonroe", re: /いくら|すじこ/, groups: ["10"] },
  { id: "salmon", re: /さけ|サーモン/, groups: ["10"] },
  { id: "mackerel", re: /さば/, groups: ["10"] },
  { id: "abalone", re: /あわび/, groups: ["10"] },
  { id: "beef", re: /うし|牛/, groups: ["11"] },
  { id: "pork", re: /ぶた|豚/, groups: ["11"] },
  { id: "chicken", re: /にわとり|鶏/, groups: ["11"] },
  { id: "gelatin", re: /ゼラチン/ },
  { id: "yam", re: /やまのいも|ながいも|やまといも|いちょういも|じねんじょ/ },
];

export function guessMextAllergens(code: string, name: string): AllergenId[] {
  const g = code.slice(0, 2);
  const hits = ALLERGEN_RULES.filter((r) => (!r.groups || r.groups.includes(g)) && r.re.test(name)).map((r) => r.id);
  return [...new Set(hits)];
}

function findHeader(rows: unknown[][], label: string, before: number): { row: number; col: number } | null {
  for (let r = 0; r < Math.min(before, rows.length); r++) {
    const c = rows[r].findIndex((v) => cell(v) === label);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

/** シート全体（行の配列）を食品の一覧にする。形が違えば理由を投げる */
export function parseMextSheet(rows: unknown[][]): MextFood[] {
  const tagRow = rows.findIndex((r) => r.some((v) => cell(v) === "ENERC_KCAL"));
  if (tagRow < 0) throw new Error("成分識別子（ENERC_KCAL）の行が見つかりません。第2章（データ）の Excel か確かめてください。");
  const code = findHeader(rows, "食品番号", tagRow + 1);
  const name = findHeader(rows, "食品名", tagRow + 1);
  if (!code || !name) throw new Error("「食品番号」「食品名」の見出しが見つかりません。");
  const tags = rows[tagRow].map(cell);
  const cols = Object.fromEntries(Object.entries(MEXT_NUTRIENTS).flatMap(([k, ids]) => {
    const c = ids.map((id) => tags.indexOf(id)).find((i) => i >= 0);
    return c === undefined ? [] : [[k, c]];
  })) as Record<string, number>;

  const out: MextFood[] = [];
  for (const r of rows.slice(tagRow + 1)) {
    // 食品番号が数として入っていると先頭の0が落ちる（01015 → 1015）ので5桁にそろえる
    const c = cell(r[code.col]).normalize("NFKC").replace(/^(\d{4})$/, "0$1");
    const n = String(r[name.col] ?? "").trim();
    if (!/^\d{5}$/.test(c) || !n) continue;
    const display = cleanMextName(n);
    const nutrition: Record<string, number> = {};
    for (const [k, col] of Object.entries(cols)) {
      const v = parseMextValue(r[col]);
      if (v !== null) nutrition[k] = v;
    }
    out.push({
      code: c, name: display, aliases: mextAliases(display), category: GROUPS[c.slice(0, 2)] ?? "その他",
      allergens: guessMextAllergens(c, display.normalize("NFKC")), nutrition,
    });
  }
  return out;
}

/** 食品名を区切りごとに分ける（かっこは外す）。「（砂糖類） 車糖 上白糖」→ ["砂糖類","車糖","上白糖"] */
export function mextSegments(name: string): string[] {
  return name.normalize("NFKC").split(" ").map((s) => s.replace(/^[<(\[](.*)[>)\]]$/, "$1")).filter(Boolean);
}

/**
 * はじめの材料（base_*）と成分表の食品を結ぶ。tokens がすべて「区切りとして」名前にある最初の食品（表の順）。
 * 文字が含まれるだけでは結ばない（「米粉」で玄米粉、「食塩」で食塩無添加、「もも」ですももに当たってしまうため）
 */
export function findMextFor(tokens: string[], foods: MextFood[]): MextFood | null {
  const want = tokens.map((t) => t.normalize("NFKC"));
  return foods.find((f) => {
    const segs = mextSegments(f.name);
    return want.every((t) => segs.includes(t));
  }) ?? null;
}
