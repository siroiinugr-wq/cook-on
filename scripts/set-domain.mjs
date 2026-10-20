// 店舗の独自ドメイン（ホワイトラベル）を登録する：tenantDomains/{ドメイン} = { orgId }
// ログイン前の画面が、このドメインで開かれたらその店舗のロゴと色で出る（src/hooks/useBranding.ts）。
// ドメイン自体は Firebase Hosting の「カスタムドメインを追加」でつなぐ（SETUP.md の「独自ドメイン」）。
//
// 使い方：cd ~/cook-on && node scripts/set-domain.mjs recipe.example.jp <店舗ID> --project cook-on-plaz
//         消すとき：node scripts/set-domain.mjs recipe.example.jp --delete --project cook-on-plaz
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/", import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf("--project");
const projectId = at >= 0 ? args[at + 1] : "";
const [host, orgId] = args.filter((a, i) => !a.startsWith("--") && i !== at + 1);
const del = args.includes("--delete");
if (!projectId || !host || (!orgId && !del)) {
  console.error("使い方：node scripts/set-domain.mjs <ドメイン> <店舗ID> --project cook-on-plaz");
  process.exit(1);
}
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
initializeApp({ projectId });
const db = getFirestore();
const ref = db.doc(`tenantDomains/${host.toLowerCase()}`);
if (del) {
  await ref.delete();
  console.log(`${host} の登録を消しました。`);
} else {
  if (!(await db.doc(`organizations/${orgId}`).get()).exists) {
    console.error(`店舗 ${orgId} が見つかりません。設定画面のURLなどで店舗IDを確かめてください。`);
    process.exit(1);
  }
  await ref.set({ orgId });
  console.log(`${host} → 店舗 ${orgId} を登録しました。`);
}
