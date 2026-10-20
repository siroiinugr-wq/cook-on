# COOK ON（菓子・食品業向け レシピ管理と原価計算の SaaS）

- セットアップ手順：`SETUP.md`
- 設計書（スキーマ・クレジット・画面の流れ・AIのプロンプト）：Claude Doc「COOK ON システム設計」 https://claude.ai/code/artifact/046989f2-d800-4f12-9e3b-a6674b003616

## 基本情報
- Firebase プロジェクト ID：`cook-on-plaz`（コマンドには必ず `--project cook-on-plaz` を付ける）
- 本番URL：https://cook.iwakuni-design.com（予備 https://cook-on-plaz.web.app）。店舗ごとの独自ドメインは `tenantDomains`。本体のドメインは `src/hooks/useBranding.ts` の `APP_HOSTS` にも書く
- ロゴ：`public/logo-mark.png`（丸のマーク）・`logo-wordmark.png`（横長）・`logo-stacked.png`（縦）。アイコンは `icon-*.png`・`apple-touch-icon.png`・`favicon.png`。店舗のロゴが無く名前も COOK ON のままのときはこのマークを出す（`brandLogo`）
- リージョン：asia-northeast1 ／ Functions：Node 24
- 技術：React 19 + Vite + TypeScript + Tailwind v4 + react-router-dom v7 ／ Firebase（Auth・Firestore・Functions・Storage・Hosting）／ Gemini `gemini-3.5-flash-lite`（`functions/src/ai/config.ts` の `GEMINI_MODEL`）
- 記録：GitHub `siroiinugr-wq/cook-on`（非公開）／ブランチ `main`
- 土台は AI経理（ai-accounting）と同じ作り：クレーム `orgs: {orgId: role}`、`@shared` で画面とサーバーが同じ計算を読む、`.env.local` が無ければデモモード、見た目は `src/index.css` の `@theme`。文字は COOK ON だけロゴと同じ Inter＋日本語は Noto Sans JP（`index.html` で読み込み）

## 構成
画面（`src/`）
- `pages/` 1画面1ファイル：Recipes（一覧）・RecipeDetail・RecipeEdit・WorkMode（作業モード）・Label（食品表示）・Ingredients・Products（既製品）・Import／ImportPreview・Credits・Settings・Login／VerifyEmail／Onboarding／Invite
- `components/recipe` 原価・倍率・履歴・AI相談、`recipe/edit` 材料行と工程の編集、`label` ラベル1枚と印刷CSS、`import` 取り込みプレビュー、`ingredient` 材料と既製品、`settings`
- `contexts/OrgContext.tsx` いまの店舗・役割（`useOrgCtx()`）
- `lib/store.ts` Firestore と Functions の入口（画面は firebase を直接触らない）。デモは `lib/demo*.ts`（同じパス・同じ関数名で手元のデータとにせのAIが動く）
- `lib/ingredientLink.ts` 材料行を店舗の材料に結ぶ（共有の材料を選んだら店舗の材料として写す）

サーバー（`functions/src/`）
- `shared/` 画面と共通：原価 `cost.ts`、ラベル `label.ts`、単位 `units.ts`、アレルゲン28品目 `allergens.ts`、クレジット単価 `credits.ts`、名寄せ `matchKey.ts`・`resolveLocal.ts`、レシピの整形 `recipe.ts`、はじめの材料 `globalSeed.ts`
- `core/` 権限 `auth.ts`（`requireRole`）、クレジットの予約→確定→返金 `credits.ts`（`runWithCredits`）、招待 `invite.ts`
- `ai/` Gemini（`gemini.ts`・`prompts.ts`）、名寄せ `normalize.ts`・`resolve.ts`、取り込み `importRecipes.ts`、既製品の下書き・相談 `assist.ts`
- `recipes/` 保存と版 `save.ts`、取り込みの保存 `importSave.ts`、原価アラート `costAlert.ts`（材料のトリガ）
- `ugc/products.ts` 既製品の登録と票（昇格）、`billing/credits.ts` 購入（準備中）と付与

Firestore
```
organizations/{orgId}                     名前・plan・credits・settings（credits と plan は画面から変えられない）
  public/branding                          表示名・ロゴ・テーマ色（誰でも読める）
  members/{uid}  invites/{token}
  ingredients/{id}  └ priceHistory/{id}    材料（画面から書ける）と値段の記録
  recipes/{id}  └ versions/{n}             レシピ（saveRecipe だけが書く）と前の版
  alerts/{id}                              原価が目標を超えたお知らせ（read だけ画面から）
  imports/{id}  creditLedger/{id}  aliases/{照合キー}  ugcVotes/{productId}
globalIngredients/{id}                     共有の材料（base_* ＝はじめの材料、ugc_* ＝昇格した既製品）
ugcProducts/{id}                           既製品（お店どうしで確認）
tenantDomains/{ドメイン}                   独自ドメイン → orgId
aiRequests/{orgId}_{requestId}             受付票（Functions だけ。AIの原価もここ）
```

## このアプリだけの決まり
- **クレジットの単価・上限は `functions/src/shared/credits.ts` の1か所だけ。** 画面の「押す前の表示」とサーバーの「実際に引く量」が同じファイルを読む（ig-saas で2か所に分かれて食い違った反省）
- **無制限の店舗**：`organizations/{orgId}.unlimited = true`（運営が Firebase コンソールで付け外しする。ルールで画面からは変えられない）。`runWithCredits` は残高を見ず0クレジットで記録、取り込みの上限は `IMPORT_MAX_CHARS_UNLIMITED`（30万字。時間切れと保存の上限のため）。画面は残高を `Infinity`＝「無制限」と出し、確認を出さずに実行する
- クレジットを使う操作は必ず `runWithCredits`（予約→確定、失敗なら全額返す、`requestId` で二重に引かない）。画面は `useCreditAction` で使う数を先に見せ、`newRequestId()` を毎回付ける
- **AIの原価（トークン・円・モデル）は店舗が読める `creditLedger` に書かない。** `aiRequests` だけ。お客さまに見せる文にもAIの料金・トークンを書かない
- 名寄せは「無料の照合（完全一致・覚えた別名・似た名前）→ 決まらないものだけAIが候補から選ぶ」。AIは候補に無い id を返しても捨てる
- 売価と原価率は **税抜**。税込は表示のときだけ（`TAX_RATES`）
- レシピは画面から直接書けない（ルールで拒否）。`saveRecipe` が検索用の列（`ingredientIds`・`allergens`・`costCache`）を作り直し、前の版を `versions` に写す
- 材料の値段を変えると `onIngredientWritten` が使っているレシピの原価を計算し直し、目標を初めて超えたら `alerts` に書く
- ブランドと票はルールで項目を限っているので `saveDoc(..., { stamp: false })`（`updatedAt` を付けない）
- 写真から取り込み（`/import/photos`、`pages/ImportPhotosPage.tsx`）：撮影と一覧は AI経理の撮影を流用（`components/import/CameraShooter`・`CaptureTray`、`hooks/useCaptureTray`、IndexedDB `cook-on-capture`）。画面が長い辺2000pxに縮めて `orgs/{orgId}/imports/{batchId}/` に上げ、`parseImportPhotos`（`ai/importPhotos.ts`）が撮った順に4枚ずつ Gemini で読む（続きのページをまとめるため）。1枚1クレジット、上限は `importMaxPhotos`（30枚・無制限の店舗は60枚）。1枚でも読めたら写真は消す。後半は文字の取り込みと同じ `buildPreview`
- 食品表示は「重い順・添加物は／のあと・アレルゲンは最後に一括」まで自動。複合原材料の細かい決まりは対象外で、画面に「お店で確かめて」と出す

## よく使うコマンド
Mac で触る前に必ず `git pull`。

```
cd ~/cook-on && git pull && npm run build && firebase deploy --only hosting --project cook-on-plaz
```
```
cd ~/cook-on && git pull && firebase deploy --only functions --project cook-on-plaz
```
```
cd ~/cook-on && git pull && firebase deploy --only firestore:rules,firestore:indexes,storage --project cook-on-plaz
```
```
cd ~/cook-on && firebase functions:log --only <関数名> --project cook-on-plaz
```

確かめ方：`npm run build`・`npm test`（共通の計算）・`cd functions && npm run build`・`npm run test:rules`（ルール、Java が必要）・`npm run dev`（デモモード）

## 今の状態と次にやること
- 実装済み：全画面・全関数・ルールと索引・デモモード。ブラウザ（デモ）で一覧→詳細→AI相談→作業モード→ラベル→編集と履歴→新規作成→値上がりアラート→既製品の票→取り込み→クレジット→設定まで通ることを確認（2026-10-19）
- まだ本番で動かしていない（Firebase プロジェクト未作成）。SETUP.md の B〜E
- Stripe は `BILLING_ENABLED = false`（購入ボタンは「準備中」）
- 文科省の食品成分表の取り込みは未作成（公式ファイルの形を確かめてから）
- 画面のJSが1ファイル約790KB。重い画面の `React.lazy` 分割は未実施
- `grantCredits` の画面は無い
