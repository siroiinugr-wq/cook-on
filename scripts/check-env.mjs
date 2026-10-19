// Hosting に出す前の確認（firebase.json の hosting.predeploy から自動で呼ばれる）。
// .env.local が無いまま組み立てると、本番が「デモモード」で公開されてしまう（ig-saas で起きた事故の COOK ON 版）。
// .env.local の API キーが、組み立てた画面（dist）に入っているかを見る。
import { readdirSync, readFileSync, existsSync } from "node:fs";

const fail = (msg) => {
  console.error(`\n公開を止めました：${msg}\n`);
  process.exit(1);
};
if (!existsSync(".env.local")) fail(".env.local がありません。SETUP.md の C-4 を先にしてください。");
const key = /^VITE_FIREBASE_API_KEY=(.+)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim();
if (!key) fail(".env.local の VITE_FIREBASE_API_KEY が空です。");
if (!existsSync("dist/assets")) fail("dist がありません。npm run build を先に実行してください。");
const js = readdirSync("dist/assets").filter((f) => f.endsWith(".js"));
if (!js.some((f) => readFileSync(`dist/assets/${f}`, "utf8").includes(key))) {
  fail("組み立てた画面に .env.local の設定が入っていません。npm run build をやり直してから公開してください。");
}
console.log("確認OK：本番の設定で組み立てた画面です。");
