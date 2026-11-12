# Worth A Try?

[English demo](https://worthatry.everyonesai.org/en) · [日本語](#日本語)

## English

Worth A Try helps founders test demand and pricing before building a product. Enter an idea and the app uses OpenAI to generate a landing page and Instagram ad creative. Choose one price, generate candidates from a range, or enter up to ten prices yourself. The landing page copy and ad creative stay the same, while each visitor's browser is assigned one price for the experiment.

### What changed during the hackathon

We added price experiments and PayPal Sandbox checkout to the existing demand validation tool. When a visitor starts a test checkout, the app creates a PayPal Orders API order in Japanese yen (JPY) for the assigned price. After the visitor approves and confirms the payment, the app records a completed test checkout only after PayPal confirms the capture. The campaign results show visits, checkout starts, and completed test payments by price. These are signals from a test flow and do not represent sales.

The founder can also test paying the campaign's ad budget plus the 30% service fee through a separate PayPal Sandbox checkout. Neither Sandbox flow charges real money or publishes an ad.

### Try the hosted demo

1. Open the [English demo](https://worthatry.everyonesai.org/en). Enter a sample idea, turn on price testing, and choose a fixed price or a few price options, such as ¥800, ¥1,200, and ¥1,600.
2. Generate the landing page and ad preview. Open the campaign's visitor link in a separate browser session and leave the creator view open so you can return to its results.
3. On the visitor page, select **Continue to PayPal test checkout** and approve the order using a PayPal **Sandbox Personal** buyer account. Return to Worth A Try and confirm the test payment.
4. Go back to the creator view and open the campaign results to see the checkout recorded at the displayed price.

You can use the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) to create a Sandbox Personal account if you need one. For the separate founder payment demo, select the PayPal test payment option on the campaign setup screen.

### Run locally

Use Node.js 22 or later and npm. The app runs as a Cloudflare Worker with a D1 database. For a full test, you need an OpenAI API key with text and image generation access, a PayPal Sandbox app's client ID and secret, and a Sandbox Personal buyer account. To try the hosted demo, use the link above instead of provisioning the app yourself.

1. In the repository root, create `wrangler.toml`:

   ```toml
   name = "worth-a-try-local"
   main = "worker/index.js"
   compatibility_date = "2026-11-12"

   [[d1_databases]]
   binding = "DB"
   database_name = "worth-a-try-local"
   database_id = "00000000-0000-4000-8000-000000000001"
   migrations_dir = "drizzle"
   ```

   The database ID above is a placeholder for local development. For a hosted deployment, use your own database.

2. Create `.dev.vars` in the same directory and fill in your own credentials:

   ```dotenv
   OPENAI_API_KEY=
   PAYPAL_SANDBOX_CLIENT_ID=
   PAYPAL_SANDBOX_CLIENT_SECRET=
   SERVICE_LIVE_MODE_ENABLED=false
   SERVICE_TEST_MODE_ENABLED=false
   META_AUTOLAUNCH_ENABLED=false
   ```

   Keep `.dev.vars` out of Git. Stripe, Meta, and email credentials are optional for this demo. A local run using your own OpenAI key can incur API usage charges.

3. Apply the database migrations and start the Worker:

   ```sh
   npx wrangler@4 d1 migrations apply worth-a-try-local --local
   npx wrangler@4 dev
   ```

   Open [http://localhost:8787/en](http://localhost:8787/en). Keep using the same browser and origin when PayPal returns you to the app.

4. To build and validate the Sites deployment artifact, run `npm run build` and `npm run validate`. If deploying the exported source to Sites, replace the placeholder project ID in `.openai/hosting.json` with your own project's ID.

## 日本語

Worth A Tryは、サービスを作る前に需要と価格を試せるツールです。アイデアを入力すると、OpenAIがランディングページとInstagram広告の素材を生成します。価格は固定、範囲からの自動生成、手入力のいずれかで設定でき、最大10件を比較できます。LPの文章と広告素材を共通にして、訪問者のブラウザごとに一つの価格を割り当てます。

### ハッカソンで追加した機能

既存の需要検証ツールに、価格テストとPayPal Sandbox決済を追加しました。訪問者がテスト決済へ進むと、その訪問者に表示した日本円（JPY）の価格でPayPalの注文を作ります。PayPalが決済の確定を返した時点でテスト完了を記録します。結果画面では、価格ごとの訪問数・決済開始数・テスト決済完了数を比較できます。

検証を行う人が負担する広告予算と30%の手数料も、別のPayPal Sandbox決済で試せます。どちらのSandbox決済でも、実際の請求や広告出稿は発生しません。

### デモの試し方

1. [英語版デモ](https://worthatry.everyonesai.org/en)を開き、サンプルのアイデアと価格候補を入力してLPと広告のプレビューを作ります。
2. 検証者の画面を開いたまま、別のブラウザセッションで訪問者向けのリンクを開きます。
3. 訪問者の画面でPayPalのテスト決済に進み、Sandbox Personalの購入者アカウントで承認します。Worth A Tryに戻ったらテスト決済を確定します。
4. 検証者の結果画面に戻り、表示された価格に決済結果が反映されたか確認します。

ローカルで動かす場合は、上の [Run locally](#run-locally) を参照してください。Cloudflare WorkersとD1を使い、OpenAIとPayPal Sandboxの認証情報は `.dev.vars` に設定します。
