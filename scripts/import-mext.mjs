// 文部科学省「日本食品標準成分表」の第2章（データ）の Excel を、本番の globalIngredients に書く（約2,500件）。
// id は mext_{食品番号}。何度実行しても同じ（上書き。参考価格や写真など、ほかの項目は消さない）。店舗のデータには触らない。
// はじめの材料（base_*）にも、結び先の成分値と食品番号を写す（shared/globalSeed.ts の SEED_MEXT_HINTS）。
//
// 使い方（MASAのMac。最初の1回だけ gcloud auth application-default login が必要）：
//   1. 中身を確かめる（書かない）
//      cd ~/cook-on && npm --prefix functions run build && node scripts/import-mext.mjs <Excel のURLかファイル> --dry-run
//   2. 書く
//      cd ~/cook-on && node scripts/import-mext.mjs <Excel のURLかファイル> --project cook-on-plaz
// Excel は https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html の「第2章（データ）」。
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";

const require = createRequire(new URL("../functions/", import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : "");
const src = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--project");
const dryRun = flag("--dry-run");
const projectId = opt("--project");
if (!src || (!dryRun && !projectId)) {
  console.error("使い方：node scripts/import-mext.mjs <Excel のURLかファイル> --dry-run");
  console.error("　　　　node scripts/import-mext.mjs <Excel のURLかファイル> --project cook-on-plaz");
  process.exit(1);
}

let shared;
try {
  shared = { ...require("./lib/shared/mext.js"), ...require("./lib/shared/globalSeed.js") };
} catch {
  console.error("先に functions を組み立ててください：npm --prefix functions run build");
  process.exit(1);
}
const { parseMextSheet, findMextFor, MEXT_EDITION, SEED_MEXT_HINTS, NUTRIENT_LABELS } = shared;

async function load(s) {
  if (!/^https?:\/\//.test(s)) return readFile(s);
  const res = await fetch(s);
  if (!res.ok) throw new Error(`ダウンロードできませんでした（${res.status}）：${s}`);
  return Buffer.from(await res.arrayBuffer());
}

const buf = await load(src);
let foods = null;
let lastErr = null;
for (const sheet of await readSheetNames(buf)) {
  try {
    foods = parseMextSheet(await readXlsxFile(buf, { sheet }));
    if (foods.length) {
      console.log(`シート「${sheet}」から ${foods.length} 件を読みました。`);
      break;
    }
  } catch (e) {
    lastErr = e;
  }
}
if (!foods?.length) {
  console.error(lastErr?.message ?? "食品が1件も読めませんでした。");
  process.exit(1);
}

const links = Object.entries(SEED_MEXT_HINTS).map(([id, tokens]) => ({ id, tokens, food: findMextFor(tokens, foods) }));
const fmt = (n) => Object.entries(n).map(([k, v]) => `${NUTRIENT_LABELS[k] ?? k}${v}`).join(" ");

if (dryRun) {
  const counts = {};
  for (const f of foods) counts[f.category] = (counts[f.category] ?? 0) + 1;
  console.log("\n■ 食品群ごとの件数");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}：${v}`);
  console.log("\n■ はじめの10件");
  for (const f of foods.slice(0, 10)) console.log(`  ${f.code} ${f.name}｜別名：${f.aliases.join("／")}｜${fmt(f.nutrition)}｜アレルゲン：${f.allergens.join(",") || "なし"}`);
  console.log("\n■ はじめの材料との結び先（違っていたら shared/globalSeed.ts の SEED_MEXT_HINTS を直す）");
  for (const l of links) console.log(`  ${l.id.padEnd(22)} → ${l.food ? `${l.food.code} ${l.food.name}（${fmt(l.food.nutrition)}）` : `見つからない（${l.tokens.join("＋")}）`}`);
  console.log("\n書いていません（--dry-run）。");
  process.exit(0);
}

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp({ projectId });
const db = getFirestore();
const writes = [
  ...foods.map((f) => [`globalIngredients/mext_${f.code}`, {
    name: f.name, aliases: f.aliases, category: f.category, allergens: f.allergens, nutrition: f.nutrition,
    source: "mext", mextCode: f.code, edition: MEXT_EDITION,
  }]),
  ...links.filter((l) => l.food).map((l) => [`globalIngredients/${l.id}`, { mextCode: l.food.code, nutrition: l.food.nutrition, edition: MEXT_EDITION }]),
];
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  for (const [path, data] of writes.slice(i, i + 400)) batch.set(db.doc(path), { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}
console.log(`${projectId} の globalIngredients に成分表 ${foods.length} 件を書き、はじめの材料 ${links.filter((l) => l.food).length} 件に成分値を写しました。`);
