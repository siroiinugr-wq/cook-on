# COOK ON セットアップ手順（MacBook）

上から順番に進めてください。各ステップの最後に「✅ 確認」があります。そこが確認できてから次へ進みます。
ターミナルのコマンドは **1行ずつ** コピーして貼り、Enter を押します（まとめて貼らない）。

| 段階 | やること | 目安 |
|---|---|---|
| A | コードを Mac に持ってきて、デモ画面を見る | 15分 |
| B | Firebase プロジェクトを作る（ブラウザ） | 20分 |
| C | アプリと Firebase をつなぐ | 15分 |
| D | 本番に出す | 20分 |
| E | はじめの材料を入れて、最初の店舗を作る | 10分 |
| E2 | COOK ON 本体のドメイン（cook.iwakuni-design.com） | 15分（反映待ちは別） |
| F | 独自ドメイン（ホワイトラベル） | 20分（反映待ちは別） |
| G | あとでやること（決済・食品成分表） | — |

プロジェクトIDは `cook-on-plaz` の前提で書いています。B-1 で別のIDになったら、この手順書と `.firebaserc` の `cook-on-plaz` を全部そのIDに置き換えてください。

---

## A. コードを Mac に持ってくる

### A-1. GitHub で PR をまとめる

1. GitHub の `siroiinugr-wq/cook-on` を開き、「Pull requests」の「COOK ON の土台」を開く
2. 下の緑の「Merge pull request」→「Confirm merge」

✅ 確認：リポジトリのトップに `src`、`functions`、`SETUP.md` が並ぶ

### A-2. Mac に取ってくる

```
cd ~ && git clone https://github.com/siroiinugr-wq/cook-on.git
```
```
cd ~/cook-on && npm install
```
```
cd ~/cook-on/functions && npm install
```

2行目・3行目は数分かかります（止まって見えても待つ）。

### A-3. デモ画面を開く

```
cd ~/cook-on && npm run dev
```

`Local: http://localhost:5173/` と出たら、そのアドレスをブラウザで開きます。

✅ 確認：「デモモード」の帯と、フィナンシェ・ガトーショコラ・カフェラテの3件が並ぶ。フィナンシェ →「作業モード」で大きな画面になる。「ラベルを作る」で原材料名が重い順に並ぶ

止めるときは、ターミナルで `control` + `C`。
デモで作ったデータはブラウザにだけ残ります。設定画面の下の「デモのデータを最初に戻す」で元に戻せます。

---

## B. Firebase プロジェクトを作る（ブラウザ）

### B-1. プロジェクト

1. https://console.firebase.google.com →「プロジェクトを作成」
2. 名前を `cook-on-plaz` にする（下に出る ID も `cook-on-plaz` になっているか見る。使われていたら別の ID になるので、メモしておく）
3. Google アナリティクスはオフでよい

### B-2. 料金プラン（Blaze）と予算の通知

Functions（AI・クレジットの計算）を使うには Blaze（従量課金）が必要です。

1. 左下の「アップグレード」→ Blaze → 請求先アカウントを選ぶ
2. 続けて出る「予算の通知」で **3,000円** を入れる（使いすぎたらメールが来る。止まりはしない）

### B-3. Firestore と Storage

1. 左の「Firestore Database」→「データベースを作成」→ 場所は **asia-northeast1（東京）**、「本番環境モード」
2. 左の「Storage」→「始める」→ 同じく asia-northeast1

### B-4. ログインの方法

1. 左の「Authentication」→「始める」
2. 「Google」を有効にする（サポートメールは自分のアドレス）
3. 「メール/パスワード」を有効にする（下の「メールリンク」はオフのまま）

✅ 確認：Authentication の「ログイン方法」に Google とメール/パスワードが「有効」で並ぶ

---

## C. アプリと Firebase をつなぐ

### C-1. Firebase にログイン

```
firebase login
```

ブラウザが開くので、B で使った Google アカウントを選びます。

### C-2. Gemini の API キー

1. https://aistudio.google.com/apikey →「API キーを作成」→ プロジェクトに `cook-on-plaz` を選ぶ
2. 出てきたキーをコピーして、次を実行。`Enter a value` と聞かれたら貼って Enter（画面には出ません）

```
cd ~/cook-on && firebase functions:secrets:set GEMINI_API_KEY --project cook-on-plaz
```

キーはチャットやメモに貼らないでください。ここ（Secret Manager）だけに置きます。

### C-3. 運営スタッフのメールアドレス

お店にクレジットを付ける操作（テスト・おわび用）ができる人を決めます。`functions/.env.cook-on-plaz` というファイルを作り、1行だけ書きます。

```
cd ~/cook-on && echo "STAFF_EMAILS=自分のメールアドレス" > functions/.env.cook-on-plaz
```

（複数なら `,` で区切る。秘密ではないので記録に入ってかまいません）

### C-4. 画面の設定（.env.local）

1. Firebase コンソール → 歯車 →「プロジェクトの設定」→ 下の「マイアプリ」→ `</>`（ウェブ）→ 名前 `cook-on` で登録
2. 出てきた `firebaseConfig` の値を、`.env.example` をまねて `.env.local` に書く

```
cd ~/cook-on && cp .env.example .env.local && open -e .env.local
```

`apiKey` → `VITE_FIREBASE_API_KEY=` のうしろ、のように5つ貼って保存します。

✅ 確認：`npm run dev` で開くと「デモモード」の帯が消え、ログイン画面になる

---

## D. 本番に出す

上から順に、1行ずつ。

```
cd ~/cook-on && git pull && firebase deploy --only firestore:rules,firestore:indexes,storage --project cook-on-plaz
```
```
cd ~/cook-on && firebase deploy --only functions --project cook-on-plaz
```
```
cd ~/cook-on && npm run build && firebase deploy --only hosting --project cook-on-plaz
```

- 2行目の初回は、Firestore トリガ（原価アラート・既製品の票）が「Retry the deployment in a few minutes」で失敗することがあります。権限の準備待ちなのでコードの問題ではありません。5分待って2行目をもう一度
- 「関数を削除しますか？」と聞かれたら **No**
- 3行目は `.env.local` が無い・古いと「公開を止めました」で止まります（デモのまま公開しないための確認）

✅ 確認：https://cook-on-plaz.web.app を開くと、COOK ON のロゴのログイン画面が出る

---

## E. はじめの材料と、最初の店舗

### E-1. はじめの材料（約60件）を入れる

材料名の照合（「バター」→ 無塩バター など）に使う共有の一覧です。最初の1回だけ、Mac から Firestore に書く許可をもらいます。

```
gcloud auth application-default login
```
```
cd ~/cook-on && npm --prefix functions run build && node scripts/seed-global.mjs --project cook-on-plaz
```

`gcloud` が無いときは https://cloud.google.com/sdk/docs/install から入れます（Intel Mac の brew は時間がかかるので、公式のインストーラが早い）。

✅ 確認：「cook-on-plaz の globalIngredients に 62 件を書きました。」

### E-2. 店舗を作る

1. https://cook-on-plaz.web.app（E2 が済んでいれば https://cook.iwakuni-design.com）で Google ログイン
2. 店舗名と目標の原価率を入れて「はじめる」
3. 右上のクレジットが **10** になっている（はじめてのプレゼント）
4. 「新しく作る」→「焼き菓子（クッキー）」→ 材料の「まとめて探す（無料）」→ 保存

✅ 確認：材料の画面に「仕入れ値なし」の材料が並ぶ。値段を入れると、レシピの原価が出る

---

## E2. COOK ON 本体のドメイン（cook.iwakuni-design.com）

1. Firebase コンソール →「Hosting」→「カスタムドメインを追加」→ `cook.iwakuni-design.com`
2. 出てくる DNS のレコード（A レコードか CNAME と、確認用の TXT）を、`iwakuni-design.com` の DNS の管理画面に入れる。AI経理の `keiri.iwakuni-design.com` と同じやり方です
3. Authentication →「設定」→「承認済みドメイン」に `cook.iwakuni-design.com` を足す（足さないと Google ログインが失敗する）
4. 反映を待つ（数分〜数時間。Hosting の画面が「接続済み」になれば完了。SSL の証明書は自動で付く）

✅ 確認：https://cook.iwakuni-design.com を開くとログイン画面に COOK ON のロゴが出る

DNS を入れる前（Firebase プロジェクトを作る前）にドメインだけ用意しておいても問題ありません。

---

## F. 独自ドメイン（お店ごとのブランド）

1. Firebase コンソール →「Hosting」→「カスタムドメインを追加」→ 例：`recipe.お店のドメイン.jp`。出てくる DNS の値を、ドメインの管理画面に入れる（反映に数時間かかることがある）
2. Authentication →「設定」→「承認済みドメイン」にも同じドメインを足す（足さないと Google ログインが失敗する）
3. その店舗の ID を、設定画面の「お店」の見出しの横で確かめる
4. ドメインと店舗を結ぶ

```
cd ~/cook-on && node scripts/set-domain.mjs recipe.お店のドメイン.jp 店舗ID --project cook-on-plaz
```

5. その店舗の設定画面 →「ブランド」で名前・ロゴ・色を保存

✅ 確認：そのドメインを開くと、ログイン画面にお店のロゴと名前が出る

---

## G. あとでやること

- **クレジットの購入（Stripe）**：今は「準備中」と出ます。つなぐときは `functions/src/ai/config.ts` の `BILLING_ENABLED` と `functions/src/billing/credits.ts` の `createCheckout` を Claude と一緒に作ります（Webhook を受けた関数だけが残高を足す設計）
- **テストでクレジットを足す**：運営スタッフ（C-3）が `grantCredits` を呼べます。画面はまだないので、必要になったら Claude に頼んでください
- **文科省の食品成分表**：今は「はじめの材料」約60件だけです。成分表（Excel）を取り込むスクリプトは、公式ファイルの形を確かめてから作ります
- **AIのモデル**：`gemini-3.5-flash-lite`（`functions/src/ai/config.ts` の `GEMINI_MODEL`）。料金の前提（入力 $0.25・出力 $1.25 / 100万トークン、1ドル150円）も同じファイルにあります。Google の料金表で確かめて違っていたら直してください
