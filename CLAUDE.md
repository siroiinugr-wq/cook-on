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
- `pages/` 1画面1ファイル：Recipes（一覧）・RecipeDetail・RecipeEdit・WorkMode（作業モード）・Label（食品表示）・Ingredients・Products（既製品）・Import／ImportPreview・Credits・Settings・Login／VerifyEmail／Onboarding／Invite・Todo（やること・AI）
- **動線**（2026-11-01）：下の入口は5つ「レシピ `/`｜材料 `/ingredients`（上のタブ `components/nav/MaterialTabs` で包装資材・既製品）｜仕入れ `/ingredients/invoices`｜やること `/todo`｜設定」。どの入口が光るかは `Layout.tsx` の `tabOf`。バッジとやることの一覧は `hooks/useTodo.ts` の1か所（値上がり・AI経理から届いた明細・アレルゲン未確認・仕入れ値なし・製造者の住所）。`/todo` は「いまやること」と「AIでできること」（単価の言い方は `lib/creditPer.ts`、クレジットの画面と共通）。ほかの画面から目的の場所へ直接とぶ：`/tidy#link|allergen|price|pieces|names|dups|merge|label`・`/settings#store|keiri|brand|members|stores`（`Accordion` の `id`、`hooks/useHashScroll.ts`）、`/ingredients?open=材料id&from=/recipes/…` で材料の編集を開き、保存・閉じたら from のレシピへ戻る（レシピの材料の行から）。材料の編集には使っているレシピへのリンク。新しい画面を足したら、どの入口の中かを `tabOf` に書き、`/todo` か設定から行けるようにする
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
  packaging/{id}  packagingSets/{id}       包装資材（袋・脱酸素剤。値段は税抜）と包装セット（画面から書ける）
  recipes/{id}  └ versions/{n}             レシピ（saveRecipe だけが書く）と前の版
  alerts/{id}                              原価が目標を超えたお知らせ（read だけ画面から）
  imports/{id}  creditLedger/{id}  aliases/{照合キー}  ugcVotes/{productId}
globalIngredients/{id}                     共有の材料（base_* ＝はじめの材料、ugc_* ＝昇格した既製品）
ugcProducts/{id}                           既製品（お店どうしで確認）
tenantDomains/{ドメイン}                   独自ドメイン → orgId
aiRequests/{orgId}_{requestId}             受付票（Functions だけ。AIの原価もここ）
productSizes/{照合キー}                     ネットで確かめた商品の内容量（Functions だけ。お店をまたいで使い回す）
```

## このアプリだけの決まり
- **クレジットの単価・上限は `functions/src/shared/credits.ts` の1か所だけ。** 画面の「押す前の表示」とサーバーの「実際に引く量」が同じファイルを読む（ig-saas で2か所に分かれて食い違った反省）
- **無制限の店舗**：`organizations/{orgId}.unlimited = true`（運営が Firebase コンソールで付け外しする。ルールで画面からは変えられない）。`runWithCredits` は残高を見ず0クレジットで記録、取り込みの上限は `IMPORT_MAX_CHARS_UNLIMITED`（30万字。時間切れと保存の上限のため）。画面は残高を `Infinity`＝「無制限」と出し、確認を出さずに実行する
- クレジットを使う操作は必ず `runWithCredits`（予約→確定、失敗なら全額返す、`requestId` で二重に引かない）。画面は `useCreditAction` で使う数を先に見せ（確認のポップアップに「使う量」と「残り 前→後」、無制限の店舗にも出す）、終わったら `CreditToastProvider` が実際に使った量と残りを下に出す。`newRequestId()` を毎回付ける
- **AIの原価（トークン・円・モデル）は店舗が読める `creditLedger` に書かない。** `aiRequests` だけ。お客さまに見せる文にもAIの料金・トークンを書かない
- 名寄せは「無料の照合（完全一致・覚えた別名・似た名前）→ 決まらないものだけAIが候補から選ぶ」。AIは候補に無い id を返しても捨てる
- 売価と原価率は **税抜**。税込は表示のときだけ（`TAX_RATES`）
- レシピは画面から直接書けない（ルールで拒否）。`saveRecipe` が検索用の列（`ingredientIds`・`allergens`・`costCache`）を作り直し、前の版を `versions` に写す
- 包装（`shared/packaging.ts`）：レシピの `packaging` に「1個あたり」でセットか資材を付ける。`costCache.perPiece` は材料＋包装（`packagingPerPiece` が包装の分）。資材の値段やセットの中身を変えると `onPackagingWritten`・`onPackagingSetWritten`（`recipes/packagingAlert.ts`）がレシピの `packagingIds`・`packagingSetIds` で探して計算し直す。計算し直しの本体は `costAlert.ts` の `recalcRecipes`（材料と共通）
- 材料の値段を変えると `onIngredientWritten` が使っているレシピの原価を計算し直し、目標を初めて超えたら `alerts` に書く
- ブランドと票はルールで項目を限っているので `saveDoc(..., { stamp: false })`（`updatedAt` を付けない）
- **文字・ファイルの取り込みの分け方**（`shared/importSplit.ts`、2026-11-03）：6,000字ごとの塊に分けるとき、表（CSV・TSV・Excel）はどの塊にも「【表の見出し】」を付け、レシピ名の列（`titleColumn`）が変わる行・空の行で切る。欄の中の改行（引用符の中）では切らない。1つのレシピが大きすぎるときだけ次の塊の先頭に「【前の続き】」を付け、AIはその name を「（続き）」にし、`buildPreview` が前のレシピにつなぐ。以前は見出しが最初の塊にしか無く、2つめ以降でタイトルが入らない・レシピが割れる（材料名がタイトルのレシピ）ことがあった。やり直しは、読み直して保存 → 取り込みの確認画面の「この取り込みのレシピをしまう」（`archiveImport`、手で直した第2版以降は残せる）か、取り込みの画面の「これまでの取り込み」で選んでまとめて消す（`removeImports`＝取り込みの記録を消しレシピはしまう、`components/import/PastImports.tsx`、同じファイル名の古い取り込みを選ぶボタン、2026-11-04）。ファイルはドロップでも入る。材料の値段・アレルゲンはレシピと別なので残る
- **見直し（2026-11-03）**：①アレルゲン：成分表の分類の見出し（＜えび・かに類＞など）から付けない（`CATEGORY_LABEL`・`dropCategoryHits`・`categorySuspect`＝確認済みでも見直しに出す）、生地・クリーム・ミックスナッツの推定、ドレッシング・〜の素は `needsPackageCheck` で袋の裏を確かめる印 ②**お店で作る材料**（タルト生地・りんごのキャラメリゼなど）は `Ingredient.madeFrom`＝作るレシピ。値段（材料の合計÷重さ、g）とアレルゲンはレシピから、成分（100gあたり `nutrition`・分からない行の数 `nutritionMissing`）はサーバーが中身の共有の材料（成分表・既製品）から計算（`madeFromNutrition`、2026-11-04）。レシピの画面の「このレシピを材料として使う」（`components/recipe/UseAsIngredient.tsx`）で作る・結ぶ。名前の一部が同じレシピも候補（`madeFromPartial`、自家製らしい名前だけ）。まとめて入れ直すのは `refreshMadeFrom`（`shared/madeFrom.ts`、入れ直しは `recipes/madeFrom.ts` の `syncMadeFrom`：writeRecipe・recalcRecipes・結んだとき。同じ値なら書かない・自分を使うレシピには結ばない `usesIngredient`）。整理の「お店で作る材料をレシピに結ぶ」と材料の編集から ③整理に「gに直せない材料」（1個で買って重さが無い。目安 `typicalPieceGrams`・`searchPackSizes`）と「1個の原価が10円未満」、何個分は1個1,000円以上も ④仕入れ：材料でない品は `notIngredient`（名前 `looksNonFood`＋AIの `nf`）で下にまとめ、除外した品名は `purchaseIgnore/{ignoreKey}` に覚えて次から読まない。結び先は `IngredientPicker`（打って探す。行ごとに全材料の選択肢を持たない）。成分表の材料を新しく作る名前は `shopNameFor`（お店の呼び方）、名前のままのものは整理の「成分表の名前のままの材料」で直す
- 写真から取り込み（`/import/photos`、`pages/ImportPhotosPage.tsx`）：撮影と一覧は AI経理の撮影を流用（`components/import/CameraShooter`・`CaptureTray`、`hooks/useCaptureTray`、IndexedDB `cook-on-capture`）。画面が長い辺2000pxに縮めて `orgs/{orgId}/imports/{batchId}/` に上げ、`parseImportPhotos`（`ai/importPhotos.ts`）が撮った順に4枚ずつ Gemini で読む（続きのページをまとめるため）。1枚1クレジット、上限は `importMaxPhotos`（30枚・無制限の店舗は60枚）。1枚でも読めたら写真は消す。後半は文字の取り込みと同じ `buildPreview`
- **共有の材料を公開データで埋める**：食品成分表（文科省・八訂増補2023年、約2,500品）は `scripts/import-mext.mjs`（形を直すのは `shared/mext.ts`、id は `mext_{食品番号}`、はじめの材料には `SEED_MEXT_HINTS` で成分を写す）。参考価格は `scripts/import-prices.mjs`（総務省の小売物価統計を e-Stat API で。`shared/refPrice.ts`、税込で持ち、画面の「この値段を入れる」で税抜に直してお店の仕入れ値へ）。どちらも MASA の Mac で `--dry-run` してから書く。**出典を画面に出すのが利用の条件**（`MEXT_CREDIT`・`ESTAT_CREDIT`）。メーカーのサイトや通販の画像・値段は規約と著作権があるので自動では拾わない
- **共有の材料に結ぶ**（データの整理の最初のカード、`relinkIngredients`・`confirmLinks`、`shared/link.ts`）：名前の完全一致・覚えた別名だけはその場で結ぶ（無料）。似た名前は候補を出して人が選ぶ。「AIで探す」は決まらない分を AI が候補から選ぶ（`aiMatch`、20件で1クレジット）が、結ぶのはやはり人が確かめてから。以前の別名で違う材料に結びついたもの（`misLinked`）は「結び先の見直し」に出る。発酵バターは無塩バターと別の材料（`base_butter_fermented`）
- **参考価格の自動入力**：結んだとき・取り込んだとき、仕入れ値が空なら共有の参考価格（税抜に直す）を入れて `priceSource: "ref"` の印を付ける。材料一覧・レシピの原価・材料の編集に「参考価格」と出る。お店が値段を入れ直すと印は消える（`IngredientSheet`・`PriceFill`）
- **共有の材料への提案と運営の精査**（`global/suggestions.ts`、画面 `/admin/suggestions`）：設定 `shareIngredients` がオンのお店で、アレルゲンを確かめた材料が変わると `onIngredientShared` が `globalSuggestions/{orgId}_{ingredientId}` を作る（新しい呼び方・アレルゲンの違い・自分の仕入れ値・共有に無い材料。判定は `shared/suggest.ts`）。運営が `reviewSuggestion` で採用した分だけ globalIngredients に入る（新しい材料は `shop_*`、値段は税込に直して `refPrice`、出典は「COOK ON のお店の仕入れ値」）。`estimateRefPrices` は参考価格の無い共有の材料（base・shop・ugc）の今の販売価格を、AI が Google 検索（グラウンディング、`callGeminiSearchJson`）で材料1つずつ調べて提案にする（1回40件、見たページ `sources` と Google の「検索の候補」`searchHtml` を残し、精査画面に出す＝利用の条件。運営の費用、お店のクレジットは使わない、原価は aiRequests。MASA 2026-11-01 選択）。運営は `operators/{uid}`（Firebase コンソールで作る）。お店の名前・仕入れ先は精査画面以外に出さない
- **レシート・納品書から仕入れ値**（`/ingredients/invoices`、`pages/InvoicePhotosPage.tsx`）：撮影は写真から取り込みと同じ部品（一覧のためる場所は `{orgId}:invoice`）、写真の置き場も同じ `orgs/{orgId}/imports/{batchId}/`。`readInvoices`（`ai/invoices.ts`、1枚1クレジット `invoicePhoto`、1回20枚まで）が明細を読み、お店の材料の一覧も渡して AI に結び先を選ばせる（番号で返させ、無い番号は捨てる）。サーバーは保存しない。画面で人が確かめて `invoicePatch`（`shared/invoice.ts`：税抜に直す・参考価格の印を消す・レシートの表記を別名に覚える）で材料に書く。読んだ明細は端末（localStorage）に残す。値段の記録と原価の計算し直しは `onIngredientWritten`
- **仕入れ明細ファイル（AI経理との連携）**：同じ画面で CSV を読み込める（無料）。形は `shared/purchaseLines.ts`（AI経理＝別のアプリにも同じファイルがあり、そちらの「仕入れ明細を書き出す」が作る。**変えるときは両方を同じに直す**）。つながりはファイルだけで、相手のデータベースは見ない。`fromPurchaseLines`（`shared/invoice.ts`）が同じ品名は一番新しい値段だけにし、名前・別名・一般的な名前で結ぶ。決まらない行は「AIで探す」`matchPurchaseLines`（`ai/invoices.ts`、20行で1クレジット `aiMatch`、包装の量も読む）。反映は写真と同じ `invoicePatch`
- **AI経理から自動で届く**（`link/keiri.ts`）：設定「AI経理と連携」で `createLinkCode`（管理者、コードは1回だけ表示、ハッシュを `linkCodes/{hash}` に）→ AI経理の設定に貼る → AI経理が承認のたびに `receivePurchaseLines`（HTTPS・公開、`https://asia-northeast1-cook-on-plaz.cloudfunctions.net/receivePurchaseLines`）へレシート1枚ずつ送る。`organizations/{orgId}/purchaseInbox` に置くだけ（同じレシートは上書き、300件まで）。画面の「AI経理から届いた明細」で読み込むと消す。状態は `organizations.keiriLink`（画面から変えられない）。この URL は AI経理の `integrations/cookon.ts` にも書いてある
- **品名からAIが判断**（写真もファイルも）：AIが一般名（`generic`：ﾊｸﾘｷｺ→薄力粉）も返し、お店に無い材料は `attachGlobals`（`ai/invoices.ts`、`resolveNames`）で共有の材料（成分表の成分・アレルゲン・参考価格）を探す。画面は「新しく登録：薄力粉（成分表・アレルゲンつき）」を選んでおき、`globalRef` 付きで作る。各行に100gあたりの税抜の値段と前との差（`per100`）
- **量・重さ・入り数もAIが判断**（`shared/invoice.ts`）：品名の量は `sizeFromName`（450g・200ml×3・10個入・6P）で無料で読む。AIは量と根拠 `size`（printed＝書いてある／known＝商品の決まった量／price＝値段から推定）・理由 `sizeNote`・個で買うものの1つの重さ `gramsPerPiece` を返す（プロンプトは `prompts.ts` の `SIZE_RULES`）。「AIで判断する」（`matchPurchaseLines`、`aiMatch` 20行で1クレジット）は結び先の無い行に加え、`sizeDoubt`＝量が分からない・1つの重さが分からない・今の材料の100gあたりと2.5倍以上違う行も `fixed` で量だけ確かめる（手がかりは `sizeHint`）。推定は黄色で出し、人が量を直すと `edited`。反映で材料に無い `gramsPerPiece` を写す
- **量をネットで確かめる**（`searchPackSizes`、`ai/invoices.ts`）：「AIで判断する」のあとも量が決まらない行（`needsWebSize`）を、Google 検索つきのAI（`callGeminiSearchJson`、`SIZE_SEARCH_SYSTEM`）が1品ずつ調べる（`sizeSearch`＝`SIZE_SEARCH_BATCH` 5品で1クレジット、1回20品）。見たページと検索の候補は `components/common/WebSources.tsx` で出す（利用の条件）。調べた量は共有の表 `productSizes/{productSizeKey}`（Functions だけ）に覚え、値段が近い（`sameSizePrice`）同じ商品はほかのお店でも検索せず無料
- **仕入れ値が空の材料に自動で値段**（`global/refPrices.ts`）：共有の材料に参考価格が入る・変わると `onGlobalRefPrice` が結んでいるお店の材料（仕入れ値が空か参考価格のまま）に入れる（collectionGroup `ingredients` の `globalRef`、索引は fieldOverrides）。それより前に結んだ材料や取りこぼしは、画面が開いたときに `hooks/useAutoRefPrice.ts`（`useTodo` から、無料）が入れる。データの整理の仕入れ値・材料一覧から「AIがネットで調べて入れる」（`fillPricesFromWeb`）：共有の参考価格で入るものは無料、残りは Google 検索つきのAI（`searchRefPrice`、運営の `estimateRefPrices` と共通）が1品ずつ（`priceSearch`＝5品で1クレジット、1回20品）。`includeRef` を付けると、参考価格のままでネットの記録（日付つき）が無い材料（`needsWebRefresh`）も今のネットの値段に入れ替える（データの整理の仕入れ値のボタン）。`priceSource: "ref"` と記録 `refWeb`（調べた日 `at`・税込の値段と量・入れた税抜 `exPrice`・見たページ・検索の候補。型は `shared/offers.ts` の `RefWeb`）を付け（**お店が仕入れ値を直しても refWeb は消さない**。材料の編集の「AIがネットで調べた値段」で今の仕入れ値と比べる。今の値段がネットの値段のままかは `webPriceInUse`）、結んでいる共有の材料に参考価格が無ければ運営の精査への提案（`globalSuggestions/ai_{id}`）にもする
- **ネットで値段を比べる**（`ai/compare.ts` の `compareWebPrices`、材料の編集の `WebOfferList`）：AIが Google 検索で売り場を最大6件（店・商品・税込の値段・量・送料など）探し、材料の `offers` に残す（`priceCompare`＝1回1クレジット）。調べ直すと前の結果を `offers.past`（日時・売り場・値段・選んだ候補、5回まで、`withPast`）に移し、画面の「前に調べた結果」で見られる。リンクは検索で見たページからドメインで探す（`sourceFor`、AIの書いた URL は使わない）。`shared/offers.ts` の `rankOffers` が100gあたりの安い順に並べ今の仕入れ値と比べる。「仕入れ候補」（`picked`）と「この値段を仕入れ値にする」（`offerPatch`、税込8%）。レシートの画面でも、比べてあれば最安とレシートを比べる（`cheapestPer100`）
- 既製品は材料の編集からも登録できる（`ProductForm` の `from`：材料はそのまま、ラベルの名前・アレルゲン（確認済み）・写真を既製品の表示にする）
- 仕入れ値は税抜で持つ（`purchasePrice`）。税込で入れたら `priceTax`（0・0.08・0.1）に印を残し、`toExTax`/`fromExTax`（`shared/cost.ts`）で直す
- 既製品はパッケージの裏を撮ると `readProductPhoto`（`ai/productPhoto.ts`、1クレジット）が下書きし、裏の写真は読んだら消す。表の写真はAIに渡さず、登録のときに上げて商品の画像にする（`ugc/{orgId}/{draftId}/front.jpg`）。登録するとお店の材料に入り、`settings.shareProducts` がオンならみんなの一覧（ugcProducts）にも入る（null＝初回に1回だけ聞く）
- 材料の写真は `orgs/{orgId}/ingredients/`（`photoPath`）
- **アレルゲンの確認**：材料の `allergensConfirmed`。取り込み・名寄せで作った材料は名前からの推定（`shared/allergenGuess.ts`）を入れるが「未確認」。材料の編集で保存するか、データの整理で確定すると true。**未確認・未結びつきの材料があるレシピ、製造者の住所（`settings.manufacturerAddress`）が空のときはラベルを印刷させない**（`labelMissing`）
- データの整理（`/tidy`、`pages/TidyPage.tsx`）：共有の材料に結ぶ `relinkIngredients`・アレルゲンの確定・仕入れ値（参考価格を入れる）・何個分・名前／レシピでないもの・同じ材料の行 `tidyRecipes`・表記ゆれ `mergeIngredients`（`recipes/tidy.ts`、判定は `shared/tidy.ts`）。AIなし・無料
- 材料の別名 `aliases`（キビ糖・きび糖など、最大20）：店舗の名寄せ（`loadOrgMatchData` の tenantIndex）と取り込みの保存で、この名前も同じ材料に結ぶ。表記ゆれでまとめると、消した側の名前が残した材料の別名に入る
- ラベルの名前（`labelName`＝品質表示の一般的名称）：データの整理の「7. ラベルの名前」で `suggestLabelNames`（`ai/labelNames.ts`、`LABEL_NAME_BATCH`＝20件で1クレジット）が案を出し、人が直して確定する（サーバーは保存しない）
- レシピの分類は2段：`category`（焼菓子・料理・ドリンク）と `subcategory`（種類：パウンドケーキ・クッキー）。タグは自由なラベル。新しいレシピは分類から似たレシピをコピーして始められる
- よく使う工程：`stepTemplates/{id}`（名前＋工程の配列＋`photoPaths`。画面から書ける。写真の Storage は `orgs/{orgId}/recipes/_steps/`）。レシピの工程は入れた元を `templateId`・`templateStep` で覚え、よく使う工程を編集すると使っているレシピに反映するか選べる。工程に写真を付けると、同じ文の工程（`stepKey` で比べる）がある他のレシピにも付けるか選べる。判定は `shared/steps.ts`、反映は `syncSteps`（`recipes/steps.ts`、AIなし・無料・前の版は履歴に残る）。レシピの写真・イラストは `photos`（最大6枚、先頭が表紙。Storage は工程の写真と同じ `orgs/{orgId}/recipes/{recipeId}/`）
- 食品表示は「重い順・添加物は／のあと・アレルゲンは最後に一括」まで自動。複合原材料の細かい決まりは対象外で、画面に「お店で確かめて」と出す
- **ラベル（2026-11-04）**：組み立ては `src/lib/labelBuild.ts`（1枚の `/recipes/:id/label` とまとめて印刷 `/labels` で共通）。添加物は材料の `isAdditive` に加えて名前からも見分ける（`shared/additives.ts` の `ADDITIVE_RULES`：一括名＝膨張剤・香料など、用途名併記＝ゲル化剤（ペクチン）など）。見分けた材料はラベル画面の「添加物の書き方」で選んで材料に覚える（labelName＋isAdditive）。お店で作った材料（`madeFrom`）は「タルト生地（小麦粉、バター…）」と中身を開き、中身の添加物は外の「／」のあとへ。用紙は `LABEL_PAPERS`（`sheet` があるのは A4 面付け。`a4-12-half`＝86.4×42.3 の1面に2個、はさみで半分）＋自由な大きさ `custom:幅x高さ`、A4 は「何面目から」。ラベルの初期値（期限の種類・日数・保存方法・日付は枠外）は設定 `settings.label*`、レシピの `labelInfo` が先。枠外の日付は `dateOutside`（枠内は「枠外下部に記載」）・`datePrint`（false＝スタンプ用に空ける）。内容量・原材料名の手直しも `labelInfo`（`content`・`ingredientsText`＋元の自動文 `ingredientsBase`、材料が変わると注意を出す）。詰め合わせ（箱の外に貼るラベル）は品目ごとに【名前】で原材料（`assortText`）と内容量（`assortContent`、品目の内容量があれば「コーヒー豆100g」）。レシピの無い品目（コーヒー豆など）は名前・原材料・内容量を手で入れる。よく使う詰め合わせは `organizations/{orgId}/labelSets/{id}`（name・rows・info、画面から書ける）。品目は打って探して足す（`components/label/LabelItemPicker.tsx`、ひらがなでも）。レシピの無い品目は `labelItems/{id}`（name・text・content）に保存して次から探せる。よく使う詰め合わせは名前・中の品目で探せる一覧（2026-11-05）
- **ラベルの印刷と画像（2026-11-05）**：印刷用のラベル（`PrintGrid`）は印刷するときだけ作る（`usePrinting`、beforeprint でも）。ラベルの字は端末の字（`LABEL_FONT`：ヒラギノ→游ゴシック→Noto）。画像の書き出しは `lib/labelImage.ts`（画面の表と同じ並びを mm で組み直し、PNG は600dpi で pHYs に大きさを書く＝Word・Illustrator に実寸で入る。SVG は字を直せる。コピーは ClipboardItem）。字の大きさ・欄は `labelPt`・`labelRows` を画面と共通。**入りきらないとき**（2026-11-05）：`fitLabel` が字を 0.25pt ずつ下限（食品表示基準：ラベルが150cm²以下は5.5pt、それより大きいと8pt＝`minLabelPt`）まで縮め、それでも入らなければ `FitNotice` で入る用紙（`papersThatFit`）・必要な高さを出す。印刷は「切れたまま印刷」を確認、画像は「下に伸ばして保存（字は下限のまま）／切れたまま／やめる」を選ぶ
- **印刷の位置（2026-11-11）**：印刷用のラベル（`PrintGrid`）は body の直下に置き（createPortal）、印刷のあいだは `#root` を丸ごと隠して用紙の左上ぴったりから並べる（`printCss`）。以前は画面の余白の内側にあり、約4mm右下にずれ、ロール紙では最後の行が2枚目にはみ出した。A4 の面付けは1ページずつの箱（`.label-page`、余白は padding。@page の余白は使わない）。ずれ直し（mm）は端末ごとに `cookon-printAdjust`（`usePrintAdjust`）、枠だけの「テスト印刷」と案内は `components/label/PrintHelp.tsx`。iPad の Safari は @page の用紙の大きさを見ないことがあるので、合わないときは PNG をプリンターのアプリから刷る案内を出す。実機（QL-820NWBc・A4 12面）での確認は MASA
- **栄養成分（2026-11-11）**：レシピの1個あたり・100gあたり（熱量・たんぱく質・脂質・炭水化物・食塩相当量）は `shared/nutrition.ts` の `recipeNutrition`（材料の100gあたり×重さの合計÷個数。画面が計算、保存しない）。材料の成分は、お店で作る材料は `Ingredient.nutrition`、ほかは結んだ共有の材料から1回読む（`hooks/useRecipeNutrition.ts`）。レシピの画面に `NutritionCard`、ラベルは `labelInfo.nutrition` がオンで「栄養成分表示」の行（`nutritionLabelText`、「（推定値）」つき）。**成分の分からない材料が1つでもあるとラベルには出さない**。詰め合わせのラベルには出さない。本番で値が出るには成分表の取り込み（`scripts/import-mext.mjs`）と、材料を共有の材料に結ぶことが要る
- **値が反映されない場面の見直し（2026-11-12）**：①画面の下書きは「いまの値」に足す形で更新する（`setX((cur) => ({ ...cur, ...p }))`）。以前は古い値に足していて、写真を上げている間に打った字が上げ終わったときに消えた（レシピの編集・材料の編集・ブランド・よく使う工程）。待つ処理（await）のあとで下書きを書くときは必ずこの形 ②材料を消したときも、使っていたレシピの原価・アレルゲンを計算し直す（`onIngredientWritten`） ③詰め合わせの名称・期限は、人が直していない項目だけ品目の増減に合わせ直し（`touched`）、最短の期限より長いときは注意を出す ④共有の材料に名前がぴったり同じ材料は自動で結ぶ（`hooks/useAutoLink.ts`、`relinkIngredients` の無料の分を同じ顔ぶれで1回だけ）。やることに「成分表に結んでいない材料」。運営の精査画面に成分表が入っているかの表示（`MextStatus`）

## 全アプリ共通の仕組み（2026-11-07 MASA決定。詳しくはスキル firebase-saas-dev）

- **ホーム画面に追加ボタン**：`public/a2hs.js`（全アプリで同じファイル）。スマホのブラウザで開いたときだけ出し、スクロール中は消える。位置は読み込みタグの `data-bottom`・`data-side`・`data-z` で調整。manifest の `related_applications` で Android のインストール済みを判定
- **新しい版の知らせ**：`public/update-check.js`（全アプリで同じファイル）＋ `scripts/stamp-version.mjs`（ビルドのたびに `public/version.json` に版＝コミットID）。index.html の `data-version="%VITE_APP_VERSION%"` と公開中の版を5分ごと・画面に戻ったときに比べ、違えば上に「読み込み直す」。OMNI の帯と同じ仕様
- **公開は手で**：MASA が Mac から都度出す。夜間の自動公開は入れない（2026-11-11 MASA判断で取りやめ）。出すと、開いたままの画面に上の「読み込み直す」が出る
- **ニックネーム**：メンバーどうし（管理者も）に見せるのはニックネームだけ。メールアドレスは members に置かず、画面にも出さない（自分のアドレスを自分に見せるのは可）。ニックネームが無い人は入る前に1回だけ決めてもらい、設定の「ニックネーム」（`components/settings/NicknameSection.tsx`、`/settings#me`）で変えられる。保存はサーバーの関数だけ（members は画面から書けないまま）。新しく members を作る処理に email を書かない
  - 判定は `shared/nickname.ts`、保存は `core/profile.ts` の `setNickname`、以前の members のメールは管理者が開いたときに `hideMemberEmails` が消す（端末ごとに1回）。画面は `components/common/Nickname.tsx`・`lib/profile.ts`

## よく使うコマンド
Mac で触る前に必ず `git pull`。

**本番に出すのはこの1本だけ**（取り込み→組み立て→ルール・索引・Storage・関数・画面をまとめて出す）。MASA への案内もこれだけを、1つのコピペ用ブロックで書く（cd で移動 → git pull から。全プロジェクト共通の決まり、2026-11-03）：
```
cd ~/cook-on && git pull && npm run release
```
`release` は部品の一覧（package-lock.json）の手元の書き換えを捨ててから `npm ci` で入れる（`npm install` は一覧を書き換え、次の git pull が止まった。2026-11-03）。
個別に出したいとき：

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
- 食品成分表と参考価格の取り込みスクリプトはあるが、本番にはまだ書いていない（MASA の Mac で --dry-run → 書く。e-Stat のアプリケーションIDが要る）
- 画面のJSが1ファイル約790KB。重い画面の `React.lazy` 分割は未実施
- `grantCredits` の画面は無い
