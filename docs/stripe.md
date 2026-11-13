# Stripe（クレジットの購入）のまとめ

COOK ON の有料の部分は「クレジットのまとめ買い」だけ（月額プランは無い）。OMNI の `docs/stripe.md` を手本に、単発の購入だけにしたもの。

## 全体の形

```
クレジットの画面のボタン
   ↓ createCheckout（functions/src/billing/credits.ts）が決済ページを作る
Stripe の決済ページ
   ↓ 支払いが済む
Stripe → stripeWebhook（functions/src/billing/stripe.ts）に知らせが届く
   ↓ 払い終わったか・金額が合うかを確かめる（functions/src/shared/purchase.ts）
organizations/{orgId}.credits を足す ＋ creditLedger（通帳）に「購入」
```

- **クレジットを足すのは Webhook だけ。** 決済ページから戻ってきたこと（`/credits?paid=1`）は支払いの証拠にしない
- 値段とクレジット数は `functions/src/shared/credits.ts` の `CREDIT_PACKS` の1か所。**Stripe 側に商品・価格は作らない**（決済ページを作るときに金額を渡す）。値段を変えるときはこのファイルだけ直す
- 同じ知らせが再送されても二度渡さない：`organizations/{orgId}/purchases/{決済ID}`（Functions だけが読み書き）
- コンビニ・銀行振込は、払い終わった知らせ（`checkout.session.async_payment_succeeded`）が来てから渡す
- **テストの鍵が入っている間は、運営スタッフ（`STAFF_EMAILS`）だけが購入を試せる。** ほかの人には「準備中」と出る。本番の鍵（`rk_live_`）に入れ替えて関数を出し直すと、全員が買える

## アカウント

- COOK ON 専用の Stripe アカウントを作る（Luxe Booking・OMNI と分ける。Webhook はアカウント内の全部の決済を知らせてくるため）
- 念のため、決済には metadata `app: cookon` を付けてあり、それ以外の決済ではクレジットを足さない

## Webhook（MASA が Stripe の画面で作る）

- 送り先：`https://asia-northeast1-cook-on-plaz.cloudfunctions.net/stripeWebhook`
- 作り方：Stripe の Workbench → Webhook → 新しい送信先を作成
- 受け取るイベント（3つ）
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`

## 鍵（シークレット）

| 名前 | 中身 |
| --- | --- |
| `STRIPE_SECRET_KEY` | 制限付きキー（テストは `rk_test_…`、本番は `rk_live_…`）。権限は **Checkout Sessions：書き込み** だけ |
| `STRIPE_WEBHOOK_SECRET` | Webhook の署名シークレット `whsec_…` |

```
cd ~/cook-on && firebase functions:secrets:set STRIPE_SECRET_KEY --project cook-on-plaz && firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project cook-on-plaz
```

- **鍵はチャットに貼らない。** ターミナルで聞かれたときに貼る
- **2つとも入れる前に関数を出すと、デプロイが止まる**（鍵が無いと関数を作れない）
- 入れ替えたら、関数を出し直すまで効かない（`cd ~/cook-on && git pull && npm run release`）

## 本番に出す順番

1. COOK ON 用の Stripe アカウントを作る（まずサンドボックス＝テストでよい）
2. Webhook を作る（上の送り先と3つのイベント）
3. テストの鍵2つを `secrets:set` で入れる → `npm run release`
4. MASA のアカウント（`STAFF_EMAILS` に入っているもの）でクレジットの画面から買う。カード番号は `4242 4242 4242 4242`（期限は未来・CVC は何でも）→ 数秒で残りが増え、通帳に「購入」が出るのを確かめる
5. Stripe の本番を有効化（事業者情報・口座・特定商取引法の表記のURL）→ 本番の Webhook と鍵を作り直して `secrets:set` → `npm run release`
6. 本番のカードで1,000円を買って確かめ、Stripe の画面から返金する（返金してもクレジットは自動では減らない。Firestore コンソールで `credits` を戻す）

## つまずきそうな所

- 「準備中」と出る：テストの鍵のままで、ログインしている人が `STAFF_EMAILS`（`functions/.env.cook-on-plaz`）に入っていない
- 支払ったのにクレジットが増えない：`cd ~/cook-on && firebase functions:log --only stripeWebhook --project cook-on-plaz`。「署名を確認できません」なら `STRIPE_WEBHOOK_SECRET` がその Webhook のものではない（テストと本番で別）
- 初回のデプロイで `stripeWebhook` に「Cloud Run 起動元」が付かず 403 になったら、Cloud Run の画面で allUsers に起動元を付ける（SETUP.md の commitImport と同じ）

## まだやっていないこと

- 返金の Webhook（返金は手で `credits` を戻す）
- 領収書：Stripe の設定 → メール →「支払い成功時」をONにすると、Stripe が領収書メールを送る
- 特定商取引法に基づく表記のページ（販売者の名前・住所・電話が要る）
- 月額プラン（いまは無い。作るときは OMNI の `billingsubs.ts` が手本）
