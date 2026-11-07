# 公開の手順（COOK ON）

OMNI（ig-saas）と同じ仕組み。直したものがすぐ本番に出ないようにして、確認用の場所で先に見てから、深夜に出す。
（2026-11-07 から。それまでは Mac から手で出していた。手で出す方法も今までどおり使える）

## 全体の流れ

```
コードを直す
   ↓  git push（main へ）／PR をマージ
確認用URL に自動で出る         ← MASAだけが見る。使っている人には影響なし
   ↓  Actions で「公開を予約する」を押す
release ブランチに印が付く       ← まだ本番には出ない
   ↓  毎日 深夜3時
本番に出る                      ← 予約が無い日は何も起きない
```

**覚えることは2つだけ。**

1. main に入ったものは**確認用URLに出る**。本番には出ない
2. Actionsで「公開を予約する」を押したものが、**次の深夜3時に本番へ出る**

- 「本番に出す」の前に `npm test` が通らないと止まる
- 手元から出すときの `npm run release` もそのまま使える（どちらで出してもよい）

## 普段の手順

1. PR をマージする（または `git push`）
2. 確認用URL（Actions の「確認用に出す」のログの最後に出る `…--staging-….web.app`）を開いて、自分で動かしてみる
3. 良ければ GitHub の **Actions** タブ →「公開を予約する」→ **Run workflow**
4. 翌朝、本番を開いて確かめる（オーナーで入って、レシピ・材料・仕入れ・設定が開けるか）

## 急ぐとき

Actions タブ →「公開を予約する」→「本番に出す」を続けて **Run workflow**。その場で出る。

## 重大な変更のとき

**Firestore・Storage のルールを変えた回は、深夜に任せず昼に出す。** 書き間違いはアプリ全体を止め、深夜だと朝まで誰も気づけない。
昼のうちに「公開を予約する」→「本番に出す」を続けて押し、出たあとオーナーで入って、レシピ・材料・仕入れ・設定が開けるかを確かめる。

## 確認用URLで分かること・分からないこと

確認用URLは**画面だけが別**で、関数・ルール・データは本番と同じものを使う。画面の見た目・文言・出し分けの確認用。
30日で期限が切れるが、main に入るたびに延びる。

## 新しい版の知らせ

画面を開いたまま（ホーム画面に置いたアプリは特に）デプロイが走ると、読み込み直すまで古いコードが動き続ける。
そこで、公開中の版を5分ごとと画面に戻ったときに確かめ、古ければ上に帯を出す（OMNI と同じ仕様）。

```
新しい版が公開されました。読み込み直すと最新の画面になります。 ［読み込み直す］
```

ビルドのたびに `scripts/stamp-version.mjs` が `public/version.json` に版名（コミットのID）を書き、
画面の `public/update-check.js` が、自分の版（index.html の `data-version`）と比べる。

## 初回だけの準備（MASAが自分でやる）

GitHubの機械がMASAの代わりにデプロイするための鍵と、Mac にしかない接続設定を GitHub に預ける。

### 1. サービスアカウントを作る

[Google Cloud コンソールのサービスアカウント](https://console.cloud.google.com/iam-admin/serviceaccounts?project=cook-on-plaz)を開く。

1. 「サービスアカウントを作成」→ 名前：`github-deploy` →「作成して続行」
2. ロールを足す（OMNI で 2026-10-14 に最後まで通った10個）
   - `Firebase Admin`（Firebase 管理者）
   - `Cloud Functions Admin`（Cloud Functions 管理者）
   - `Service Account User`（サービス アカウント ユーザー）
   - `Cloud Datastore Index Admin`（Datastore インデックス管理者）
   - `Secret Manager Secret Accessor`（Secret Manager のシークレット アクセサー）
   - `Artifact Registry Writer`（Artifact Registry 書き込み）
   - `Secret Manager Admin`（Secret Manager 管理者）
   - `Cloud Scheduler Admin`（Cloud Scheduler 管理者）
   - `Cloud Run Admin`（Cloud Run 管理者）
   - `Artifact Registry Administrator`（Artifact Registry 管理者）
3. 「完了」

### 2. 鍵を取り出して GitHub に預ける

作ったサービスアカウント →「キー」→「鍵を追加」→「新しい鍵を作成」→ **JSON** →「作成」。

[リポジトリの Secrets 設定](https://github.com/siroiinugr-wq/cook-on/settings/secrets/actions) →「New repository secret」
→ Name：`FIREBASE_SERVICE_ACCOUNT` → Secret：JSONファイルの**中身を全部**（`{` から `}` まで）→「Add secret」。

**この鍵は本番を操作できる。** メールやチャットに貼らない。貼り終わったらダウンロードしたファイルは消す。

### 3. Mac にしかない接続設定を預ける

### 3-1. APP_ENV（必須）

画面の接続設定。Mac の `.env.local` の中身そのまま（画面に埋め込まれる公開の値なので、秘密ではない）。

1. Mac で `cat ~/cook-on/.env.local`（無ければ `cat ~/cook-on/.env`）を実行して中身を表示する
2. 「New repository secret」→ Name：`APP_ENV` → Secret：表示された中身を全部貼る →「Add secret」

### 3-2. FUNCTIONS_ENV（必須）

`STAFF_EMAILS` が入っている（`functions/.env` か `functions/.env.cook-on-plaz`。ある方の中身）。無いと関数のデプロイが止まるので**必須**。

1. Mac で `cat ~/cook-on/functions/.env` を実行して中身を表示する
2. 「New repository secret」→ Name：`FUNCTIONS_ENV` → Secret：表示された中身を全部貼る →「Add secret」

**.env を書き換えたら、ここも貼り直す。** 古いままだと、深夜に古い設定で出てしまう。

### 4. release ブランチを作って一度試す

Actions タブ →「公開を予約する」→ Run workflow（`release` ブランチが作られる）→「本番に出す」→ Run workflow。
緑のチェックが付けば通っている。赤く止まったらログを開き、エラーの全文を Claude に渡せば直せる。

## 困ったとき

- **「Permission denied」「caller does not have permission」** … ロールが足りない。エラーに出ている権限名で検索して 1. で足す（すぐ効く）
- **「Secrets に APP_ENV がありません」** … 3. がまだ
- **「前回と同じなので何もしません」** … 正常。予約した変更が無い。先に「公開を予約する」を押す
- **「公開を予約する」が失敗する** … `release` が `main` と枝分かれしている。Claude に相談する
- **関数の削除が必要だと言われて失敗する** … 自動では消さない。意図した削除なら Mac から `firebase deploy --only functions --project cook-on-plaz` を出して、聞かれたら答える
