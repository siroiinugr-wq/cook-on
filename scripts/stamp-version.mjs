// 公開中の版に印をつける。
//
// ビルドのたびに public/version.json を書き出す。これが dist/version.json
// として配信され、画面側は「自分が読み込んだときの版」と比べる。違えば
// 「新しい版があります」の帯を出す。
//
// 画面に埋め込む値も同じファイルから読む（vite.config.ts）。1か所にする。
import {execSync} from "node:child_process";
import {mkdirSync, writeFileSync} from "node:fs";

/**
 * 版の名前を決める。GitHub Actions ではコミットのIDが環境変数に入る。
 * 手元では git から取る。どちらも取れなければ時刻で代用する。
 * @return {string} 7文字の版名
 */
function versionName() {
  // git を先に見る。GitHub Actions の GITHUB_SHA は、時刻起動のときに
  // 取り出したブランチとは別のコミットを指すことがあるため。
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    const fromCi = process.env.GITHUB_SHA;
    if (fromCi) return fromCi.slice(0, 7);
    return String(Date.now());
  }
}

const version = versionName();
mkdirSync("public", {recursive: true});
writeFileSync(
  "public/version.json",
  JSON.stringify({version, builtAt: new Date().toISOString()}, null, 2) + "\n",
);
console.log("この版:", version);
