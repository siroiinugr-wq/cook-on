// デモモードの最初のデータ（架空の菓子店）。パスは本番の Firestore と同じ
import { GLOBAL_SEED } from "@shared/globalSeed";
import { deriveRecipe, type RecipeInput } from "@shared/recipe";
import type { Ingredient } from "@shared/types";
import { DEFAULT_BRANDING } from "@shared/types";
import { WELCOME_CREDITS } from "@shared/credits";

export const DEMO_ORG = "demo";
const O = `organizations/${DEMO_ORG}`;
const at = "2026-10-19T09:00:00.000Z";

const ING: Ingredient[] = [
  { id: "flour", name: "薄力粉", purchasePrice: 380, purchaseQty: 1, purchaseUnit: "kg", allergens: ["wheat"], globalRef: "base_hakurikiko", labelName: "小麦粉" },
  { id: "butter", name: "無塩バター", purchasePrice: 1250, purchaseQty: 450, purchaseUnit: "g", allergens: ["milk"], globalRef: "base_butter_unsalted", labelName: "バター" },
  { id: "sugar", name: "グラニュー糖", purchasePrice: 290, purchaseQty: 1, purchaseUnit: "kg", allergens: [], globalRef: "base_granulated", labelName: "砂糖" },
  { id: "egg", name: "全卵", purchasePrice: 320, purchaseQty: 10, purchaseUnit: "個", gramsPerPiece: 50, allergens: ["egg"], globalRef: "base_egg", labelName: "鶏卵" },
  { id: "almondp", name: "アーモンドプードル", purchasePrice: 1980, purchaseQty: 1, purchaseUnit: "kg", allergens: ["almond"], globalRef: "base_almondpoodle", labelName: "アーモンドパウダー" },
  { id: "cream", name: "生クリーム", purchasePrice: 980, purchaseQty: 1000, purchaseUnit: "ml", gramsPerMl: 1.0, allergens: ["milk"], globalRef: "base_cream", labelName: "クリーム（乳製品）" },
  { id: "choco", name: "チョコレート（ビター）", purchasePrice: 2400, purchaseQty: 1, purchaseUnit: "kg", allergens: ["milk", "soy"], globalRef: "base_chocolate", labelName: "チョコレート（砂糖、カカオマス、ココアバター）" },
  { id: "salt", name: "食塩", purchasePrice: 150, purchaseQty: 1, purchaseUnit: "kg", allergens: [], globalRef: "base_salt", labelName: "食塩" },
  { id: "bp", name: "ベーキングパウダー", purchasePrice: 480, purchaseQty: 450, purchaseUnit: "g", allergens: [], globalRef: "base_bakingpowder", labelName: "膨張剤", isAdditive: true },
  { id: "coffee", name: "コーヒー豆", purchasePrice: 3200, purchaseQty: 1, purchaseUnit: "kg", allergens: [], globalRef: "base_coffee_beans" },
  { id: "milk", name: "牛乳", purchasePrice: 260, purchaseQty: 1000, purchaseUnit: "ml", gramsPerMl: 1.03, allergens: ["milk"], globalRef: "base_milk" },
  { id: "vanilla", name: "バニラビーンズ", purchasePrice: null, purchaseQty: 1, purchaseUnit: "本", allergens: [], globalRef: "base_vanillabean" },
];

const RECIPES: (RecipeInput & { id: string })[] = [
  {
    id: "financier", name: "フィナンシェ", category: "焼き菓子", tags: ["定番", "ギフト"], sellingPrice: 280, targetCostRate: 0.3,
    yield: { pieces: 12, gramsPerPiece: 40 },
    items: [
      { ingredientId: "butter", name: "無塩バター", qty: 120, unit: "g", note: "焦がしバターにする" },
      { ingredientId: "sugar", name: "グラニュー糖", qty: 110, unit: "g" },
      { ingredientId: "almondp", name: "アーモンドプードル", qty: 50, unit: "g" },
      { ingredientId: "flour", name: "薄力粉", qty: 40, unit: "g" },
      { ingredientId: "egg", name: "全卵", qty: 2, unit: "個", note: "卵白だけでも可" },
      { ingredientId: "salt", name: "食塩", qty: null, unit: "適量" },
    ],
    steps: [
      { text: "バターを中火にかけ、薄い茶色になるまで焦がして濾す" },
      { text: "粉類と砂糖を合わせてふるう" },
      { text: "卵を加えて混ぜ、焦がしバターを40℃で加える" },
      { text: "型の8分目まで流し、190℃で13分焼く" },
    ],
  },
  {
    id: "gateau", name: "ガトーショコラ", category: "ケーキ", tags: ["冬限定"], sellingPrice: 480, targetCostRate: 0.32,
    yield: { pieces: 8, gramsPerPiece: null },
    items: [
      { ingredientId: "choco", name: "チョコレート（ビター）", qty: 150, unit: "g" },
      { ingredientId: "butter", name: "無塩バター", qty: 100, unit: "g" },
      { ingredientId: "egg", name: "全卵", qty: 3, unit: "個" },
      { ingredientId: "sugar", name: "グラニュー糖", qty: 90, unit: "g" },
      { ingredientId: "cream", name: "生クリーム", qty: 60, unit: "ml" },
      { ingredientId: "flour", name: "薄力粉", qty: 20, unit: "g" },
    ],
    steps: [{ text: "チョコとバターを湯せんで溶かす" }, { text: "卵黄・砂糖・生クリームを混ぜる" }, { text: "メレンゲと粉を加え、160℃で40分焼く" }],
  },
  {
    id: "latte", name: "カフェラテ", category: "ドリンク", tags: ["定番"], sellingPrice: 500, targetCostRate: 0.25,
    yield: { pieces: 1, gramsPerPiece: null },
    items: [{ ingredientId: "coffee", name: "コーヒー豆", qty: 18, unit: "g" }, { ingredientId: "milk", name: "牛乳", qty: 200, unit: "ml" }],
    steps: [{ text: "エスプレッソを抽出する" }, { text: "牛乳をスチームして注ぐ" }],
  },
];

// デモの共有の材料に付ける成分と参考価格（値はデモ用。本番は成分表と総務省の小売物価統計から取り込む）
const DEMO_REF = { area: "デモ", asOf: "2026-09", source: "デモの値（本番は総務省「小売物価統計調査」）" };
const DEMO_GLOBAL_EXTRA: Record<string, Record<string, unknown>> = {
  base_hakurikiko: { mextCode: "01015", nutrition: { kcal: 349, protein: 8.3, fat: 1.5, carbohydrate: 75.8, salt: 0 }, refPrice: { price: 300, qty: 1, unit: "kg", item: "小麦粉（デモ）", ...DEMO_REF } },
  base_egg: { mextCode: "12004", nutrition: { kcal: 142, protein: 12.2, fat: 10.2, carbohydrate: 0.4, salt: 0.4 }, refPrice: { price: 300, qty: 10, unit: "個", item: "鶏卵 10個入り（デモ）", ...DEMO_REF } },
  base_butter_unsalted: { refPrice: { price: 540, qty: 200, unit: "g", item: "バター 200g（デモ）", ...DEMO_REF } },
};

export function seedDemo(): [string, Record<string, unknown>][] {
  const ingById = new Map(ING.map((i) => [i.id, i]));
  const out: [string, Record<string, unknown>][] = [
    [O, { name: "デモ菓子店", plan: "free", credits: WELCOME_CREDITS, ownerUid: "demo-user", settings: { targetCostRate: 0.3, manufacturer: "デモ菓子店　山口県岩国市〇〇町1-2-3", includeRecommendedAllergens: true }, createdAt: at }],
    [`${O}/members/demo-user`, { uid: "demo-user", role: "owner", email: "demo@example.com", displayName: "デモ" }],
    [`${O}/public/branding`, { ...DEFAULT_BRANDING }],
    [`${O}/creditLedger/welcome`, { kind: "welcome", amount: WELCOME_CREDITS, status: "done", createdAt: at }],
    [`${O}/alerts/a1`, { kind: "costOverTarget", recipeId: "gateau", recipeName: "ガトーショコラ", ingredientId: "choco", ingredientName: "チョコレート（ビター）", oldRate: 0.29, newRate: 0.34, target: 0.32, read: false, createdAt: at }],
    ...ING.map(({ id, ...d }) => [`${O}/ingredients/${id}`, { ...d, updatedAt: at }] as [string, Record<string, unknown>]),
    ...RECIPES.map(({ id, ...r }) => [`${O}/recipes/${id}`, { ...r, ...deriveRecipe(r, ingById), version: 1, archived: false, updatedAt: at }] as [string, Record<string, unknown>]),
    ...GLOBAL_SEED.map(({ id, ...g }) => [`globalIngredients/${id}`, { ...g, source: "base", ...DEMO_GLOBAL_EXTRA[id] }] as [string, Record<string, unknown>]),
    // 食品成分表から取り込んだ材料の見本（本番は scripts/import-mext.mjs で約2,500件）
    ["globalIngredients/mext_05001", { name: "アーモンド 乾", aliases: ["アーモンド 乾"], category: "種実類", allergens: ["almond"], nutrition: { kcal: 609, protein: 19.6, fat: 51.8, carbohydrate: 20.9, salt: 0 }, source: "mext", mextCode: "05001" }],
    ["globalIngredients/mext_07012", { name: "いちご 生", aliases: ["いちご"], category: "果実類", allergens: [], nutrition: { kcal: 31, protein: 0.9, fat: 0.1, carbohydrate: 8.5, salt: 0 }, source: "mext", mextCode: "07012" }],
    ["ugcProducts/u1", { key: "明治ブラックチョコレート", maker: "明治", productName: "ブラックチョコレート", ingredientsText: "カカオマス、砂糖、ココアバター／乳化剤、香料、（一部に乳成分・大豆を含む）", allergens: ["milk", "soy"], createdByOrg: "other", goodCount: 7, badCount: 1, status: "pending", createdAt: at }],
    ["ugcProducts/u2", { key: "よつ葉乳業よつ葉バター食塩不使用", maker: "よつ葉乳業", productName: "よつ葉バター 食塩不使用", ingredientsText: "生乳（北海道産）", allergens: ["milk"], createdByOrg: "other", goodCount: 12, badCount: 0, status: "promoted", createdAt: at }],
  ];
  return out;
}
