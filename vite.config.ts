import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// 画面の版（ビルドした日時・日本時間）。設定画面のいちばん下に出して、スマホに新しい画面が届いたか確かめる
const BUILD_TIME = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [react(), tailwindcss()],
  resolve: {
    // 原価・ラベル・名寄せ・クレジット単価は Functions と共通（定義は functions/src/shared の1か所だけ）
    alias: { "@shared": fileURLToPath(new URL("./functions/src/shared", import.meta.url)) },
  },
  test: { include: ["functions/src/**/*.test.ts", "src/**/*.test.ts"] },
});
