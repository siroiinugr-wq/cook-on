// 共有の材料に「参考価格」（refPrice）を書く。お店の仕入れ値には触らない（お店は画面の「この値段を入れる」で写す）。
//
// A. 総務省「小売物価統計調査」から（政府統計の総合窓口 e-Stat の API。毎月更新）
//    e-Stat でユーザー登録して「アプリケーションID」を取る（無料）。ID は秘密にはしなくてよいが、記録（Git）には入れない。
//      cd ~/cook-on && npm --prefix functions run build && ESTAT_APP_ID=<アプリケーションID> node scripts/import-prices.mjs --estat --dry-run
//      cd ~/cook-on && ESTAT_APP_ID=<アプリケーションID> node scripts/import-prices.mjs --estat --project cook-on-plaz
//    --dry-run で、使う表・地域・月・品目ごとの結び先と値段が出る。違っていたら shared/refPrice.ts の ESTAT_ITEM_MAP を直す。
//    表を自分で選ぶときは --table <統計表ID>、地域を変えるときは --area 広島市 のように付ける（既定は東京都区部）。
//
// B. 手で用意した CSV から（業務用の卸値などを運営が入れたいとき）
//      cd ~/cook-on && npm --prefix functions run build && node scripts/import-prices.mjs --csv prices.csv --project cook-on-plaz
//    1行目は見出し：globalId,price,qty,unit,item,area,asOf,source（price は税込の円、asOf は 2026-09 の形）
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(new URL("../functions/", import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] ?? "" : "");
const dryRun = args.includes("--dry-run");
const projectId = opt("--project");
const csvPath = opt("--csv");
const useEstat = args.includes("--estat");
if ((!useEstat && !csvPath) || (!dryRun && !projectId)) {
  console.error("使い方は scripts/import-prices.mjs の先頭に書いてあります（--estat か --csv、書くときは --project cook-on-plaz）。");
  process.exit(1);
}

let shared;
try {
  shared = require("./lib/shared/refPrice.js");
} catch {
  console.error("先に functions を組み立ててください：npm --prefix functions run build");
  process.exit(1);
}
const { ESTAT_ITEM_MAP, parseQtyUnit, refPriceExTax } = shared;
const UNITS = ["g", "kg", "ml", "l", "個", "枚", "本"];

/** @type {{ globalId: string, refPrice: object }[]} */
let rows = [];

if (csvPath) {
  const lines = (await readFile(csvPath, "utf8")).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(",").map((s) => s.trim());
  for (const [n, line] of lines.entries()) {
    const c = Object.fromEntries(line.split(",").map((v, i) => [head[i], v.trim()]));
    const price = Number(c.price);
    const qty = Number(c.qty);
    if (!c.globalId || !(price > 0) || !(qty > 0) || !UNITS.includes(c.unit) || !/^\d{4}-\d{2}$/.test(c.asOf ?? "")) {
      console.error(`${n + 2}行目を読めません：${line}`);
      process.exit(1);
    }
    rows.push({ globalId: c.globalId, refPrice: { price, qty, unit: c.unit, item: c.item ?? "", area: c.area ?? "", asOf: c.asOf, source: c.source || "運営が調べた値段" } });
  }
}

if (useEstat) {
  const appId = process.env.ESTAT_APP_ID || opt("--appId");
  if (!appId) {
    console.error("ESTAT_APP_ID=<アプリケーションID> を付けてください（e-Stat のマイページで発行）。");
    process.exit(1);
  }
  const api = async (name, params) => {
    const url = `https://api.e-stat.go.jp/rest/3.0/app/json/${name}?${new URLSearchParams({ appId, ...params })}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`e-Stat が ${res.status} を返しました（${name}）`);
    return res.json();
  };
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const text = (x) => (typeof x === "string" ? x : x?.$ ?? "");

  let tableId = opt("--table");
  if (!tableId) {
    const r = await api("getStatsList", { statsCode: "00200571", searchWord: "主要品目 都市別 小売価格" });
    const tables = list(r?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF)
      .map((t) => ({ id: t["@id"], title: text(t.TITLE), stat: text(t.STATISTICS_NAME), open: String(t.OPEN_DATE ?? ""), survey: String(t.SURVEY_DATE ?? "") }))
      .filter((t) => /小売価格/.test(`${t.title}${t.stat}`))
      .sort((a, b) => b.open.localeCompare(a.open));
    console.log("■ 見つかった表（新しい順・上位10）");
    for (const t of tables.slice(0, 10)) console.log(`  ${t.id}｜${t.stat}｜${t.title}｜公開 ${t.open}`);
    tableId = tables.find((t) => /都市別/.test(`${t.title}${t.stat}`))?.id ?? tables[0]?.id;
    if (!tableId) {
      console.error("小売物価統計の表が見つかりません。--table <統計表ID> で指定してください。");
      process.exit(1);
    }
  }
  console.log(`使う表：${tableId}`);

  const meta = await api("getMetaInfo", { statsDataId: tableId });
  const classes = list(meta?.GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ);
  const cls = (id) => list(classes.find((c) => c["@id"] === id)?.CLASS);
  const areaName = opt("--area") || "東京都区部";
  const area = cls("area").find((c) => String(c["@name"]).includes(areaName));
  const times = cls("time").sort((a, b) => String(b["@code"]).localeCompare(String(a["@code"])));
  const items = classes.filter((c) => /^cat/.test(c["@id"])).flatMap((c) => list(c.CLASS).map((x) => ({ dim: c["@id"], code: x["@code"], name: String(x["@name"]), unit: String(x["@unit"] ?? "") })));
  if (!area || !times.length || !items.length) {
    console.error(`表の形が想定と違います（地域「${areaName}」${area ? "あり" : "なし"}・時点 ${times.length}・品目 ${items.length}）。--table で別の表を選んでください。`);
    process.exit(1);
  }

  // 新しい月から順に、値が入っている月を使う（公表前の月が空のことがある）
  let values = [];
  let time = null;
  for (const t of times.slice(0, 3)) {
    const d = await api("getStatsData", { statsDataId: tableId, cdArea: area["@code"], cdTime: t["@code"] });
    values = list(d?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE).filter((v) => Number(v.$) > 0);
    if (values.length) {
      time = t;
      break;
    }
  }
  if (!time) {
    console.error("値が入っている月が見つかりません。");
    process.exit(1);
  }
  const m = String(time["@name"]).normalize("NFKC").match(/(\d{4})年\s*(\d{1,2})月/);
  const asOf = m ? `${m[1]}-${m[2].padStart(2, "0")}` : String(time["@code"]).slice(0, 4) + "-" + String(time["@code"]).slice(-2);
  console.log(`地域：${area["@name"]}／時点：${time["@name"]}（${asOf}）／値 ${values.length} 件\n`);

  console.log("■ 品目の結び先");
  for (const e of ESTAT_ITEM_MAP) {
    const it = items.find((x) => e.tokens.every((t) => x.name.includes(t)));
    const v = it && values.find((x) => String(x[`@${it.dim}`]) === String(it.code));
    const qu = it && (parseQtyUnit(it.name) ?? parseQtyUnit(it.unit) ?? parseQtyUnit(String(v?.["@unit"] ?? "")));
    if (!it || !v || !qu) {
      console.log(`  ${e.globalId.padEnd(20)} … 使えない（${!it ? "品目が無い" : !v ? "値が無い" : `量を読めない：${it.name} ${it.unit}`}）`);
      continue;
    }
    const refPrice = { price: Number(v.$), qty: qu.qty, unit: qu.unit, item: it.name.replace(/^\d+\s*/, "").slice(0, 120), area: String(area["@name"]), asOf, source: "総務省「小売物価統計調査」" };
    console.log(`  ${e.globalId.padEnd(20)} ← ${refPrice.item}｜${refPrice.price}円（税込）/${qu.qty}${qu.unit}｜税抜 ${refPriceExTax(refPrice)}円`);
    rows.push({ globalId: e.globalId, refPrice });
  }
}

if (dryRun) {
  console.log(`\n${rows.length} 件。書いていません（--dry-run）。`);
  process.exit(0);
}
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp({ projectId });
const db = getFirestore();
const batch = db.batch();
for (const r of rows) batch.set(db.doc(`globalIngredients/${r.globalId}`), { refPrice: r.refPrice, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
await batch.commit();
console.log(`${projectId} の共有の材料 ${rows.length} 件に参考価格を書きました。`);
