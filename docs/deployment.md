# デプロイ

## A. GitHub Pagesだけ（無料）

Appleショートカット、ブックマークレット、またはHLS直接入力を使う構成です。ルームURLをPWAへ貼ってそのまま解決する機能だけは使えません。

1. このディレクトリをGitHub repositoryへpush。
2. repositoryのSettings → Pages → Sourceを「GitHub Actions」にする。
3. `main`へのpushで`.github/workflows/pages.yml`がテスト、build、deployを行う。
4. 公開URLに合わせて[iPhoneショートカット](ios-shortcut.md)または[ブックマークレット](bookmarklet.md)を設定。

workflowはrepository名をViteのbase pathへ自動設定するため、`https://<user>.github.io/<repo>/`で動きます。

## B. GitHub Pages + Cloudflare Worker（どちらも無料枠）

PWAへルームURLを貼るだけの操作、履歴の配信検知、閉じたiPhone/AndroidへのWeb Pushを使う場合の推奨構成です。URL解決だけなら「Worker」まで、Web Pushも使うなら「D1とWeb Push」まで設定します。

### Worker

`worker/wrangler.jsonc`の`ALLOWED_ORIGINS`を実際のPages originへ変更します。pathは含めません。

```json
"ALLOWED_ORIGINS": "https://YOUR_NAME.github.io"
```

Cloudflareへログインしてdeployします。

```bash
npx wrangler login
npm run deploy:resolver
```

表示された`https://showroom-pip-resolver.<subdomain>.workers.dev`を控えます。

### D1とWeb Push（任意）

まずD1 databaseを作成します。

```bash
npx wrangler d1 create showroom-pip --config worker/wrangler.jsonc
```

表示された`database_id`を`worker/wrangler.jsonc`末尾のコメント例へ入れ、`triggers`と`d1_databases`を有効にします。その後、migrationを適用します。

```bash
npx wrangler d1 migrations apply showroom-pip --remote --config worker/wrangler.jsonc
```

VAPID keyを1回だけ生成し、出力値をパスワード管理ツールへ保存します。秘密鍵はcommitしません。

```bash
npm run vapid:generate
npx wrangler secret put VAPID_PUBLIC_KEY --config worker/wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY --config worker/wrangler.jsonc
npx wrangler secret put VAPID_SUBJECT --config worker/wrangler.jsonc
```

`VAPID_SUBJECT`には自分が管理する`mailto:you@example.com`またはHTTPS URLを設定します。次に、十分長いランダムな`WATCH_TOKEN`をパスワード管理ツールで作り、同じ値をWorker secretへ登録します。

```bash
npx wrangler secret put WATCH_TOKEN --config worker/wrangler.jsonc
npm run deploy:resolver
```

PWAをホーム画面から開き、設定欄へResolver URLと同じ`WATCH_TOKEN`を入力します。「配信検知」をONにしてから「通知を許可」を押してください。iPhoneでは通常のSafariタブではなく、ホーム画面へ追加したPWAから操作します。

### PagesへResolver URLを渡す

GitHub repositoryのSettings → Secrets and variables → Actions → Variablesで次を追加します。

```text
VITE_RESOLVER_URL=https://showroom-pip-resolver.<subdomain>.workers.dev
```

`main`を再deployすると、初期値としてPWAへ埋め込まれます。これは秘密情報ではありません。画面設定へ手入力して端末のlocalStorageへ保存することもできます。

### 無料枠の見積もり

[Cloudflare Workers公式料金表](https://developers.cloudflare.com/workers/platform/pricing/)では、Free planは1日100,000 request、1 invocationあたり10ms CPUです。WorkerからSHOWROOMへのsubrequestはrequest課金対象外です。このResolverは再生開始時の`/resolve`に加え、最大20ルームをまとめて確認する`/status`を提供します。動画は中継しません。個人利用なら無料枠に十分収まる設計です。

Free planは上限超過後のrequestが失敗する方式です。ただしCloudflareの料金・規約は変更され得るため、deploy時に公式画面で再確認してください。Web Pushを2分間隔で1端末・20ルーム監視する場合、Cronは720回/日、D1の状態更新はおおむね720回/日です。

## C. Cloudflareだけに統合

静的ファイルもCloudflare Workers Assets/Pagesへ置けば1サービスにできます。ただし本リポジトリでは「PWAはGitHub Pages、APIだけWorker」と分離し、Pagesだけのサーバーレス経路を残しています。

## GitHub Actionsで定期JSON生成は不採用

固定ルーム一覧だけなら、ActionsがHLS URLをJSONへ書き出す方式も可能です。しかしGitHub Actionsのscheduleは[最短5分間隔](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)で、開始直後のライブ取得には遅く、HLS URLの寿命とも相性が悪いため採用していません。

## deployしないもの

- HLS manifestやsegment
- SHOWROOM cookie/session
- 取得済みHLS URLのログ・DB
- ルームの再生時刻・視聴回数
- 公開CORS proxy
