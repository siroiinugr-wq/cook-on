// 共有マスターの「はじめの材料」（functions/src/shared/globalSeed.ts）を本番の globalIngredients に書く。
// 何度実行しても同じ（同じ id に上書き）。店舗のデータには触らない。
//
// 使い方（MASAのMac。最初の1回だけ gcloud auth application-default login が必要）：
//   cd ~/cook-on && npm --prefix functions run build && node scripts/seed-global.mjs --project cook-on-plaz
// エミュレーターに入れるとき：FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-global.mjs --project demo-cook-on
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/", import.meta.url));
const at = process.argv.indexOf("--project");
const projectId = at > 0 ? process.argv[at + 1] : "";
if (!projectId) {
  console.error("プロジェクトIDを付けてください：node scripts/seed-global.mjs --project cook-on-plaz");
  process.exit(1);
}

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
let GLOBAL_SEED;
try {
  ({ GLOBAL_SEED } = require("./lib/shared/globalSeed.js"));
} catch {
  console.error("先に functions を組み立ててください：npm --prefix functions run build");
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();
const batch = db.batch();
for (const { id, ...g } of GLOBAL_SEED) {
  batch.set(db.doc(`globalIngredients/${id}`), { ...g, source: "base", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
await batch.commit();
console.log(`${projectId} の globalIngredients に ${GLOBAL_SEED.length} 件を書きました。`);
