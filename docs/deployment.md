# GitHub PagesとResolverへのデプロイ

静的画面はGitHub Pagesへ置きます。配信URL解決は、全端末から同じVercel Functionへ送ります。databaseや定期処理はありません。secretと動画proxyも不要です。Vercel Hobbyの無料枠は個人・非商用利用が対象です。

## 1. Resolverをdeployする

Vercelへloginしてrepository rootで実行します。

```bash
npx vercel login
npx vercel
npx vercel --prod
```

生成された`https://<project>.vercel.app`を控え、次を確認します。

```bash
curl -H 'Origin: https://yhcfu.github.io' \
  'https://<project>.vercel.app/api/resolve?room=<配信中のroom key>'
```

Resolverは既定で`https://yhcfu.github.io`とlocalhostだけを許可します。別のGitHub Pages ownerから使う場合は、Vercel projectの`ALLOWED_ORIGINS`へoriginをカンマ区切りで追加してください。

## 2. GitHub Pagesを設定する

1. repositoryをGitHubへpushする。
2. GitHubのSettings → Pagesを開く。
3. Build and deploymentのSourceで「GitHub Actions」を選ぶ。
4. Settings → Secrets and variables → Actions → Variablesで`RESOLVER_URL`を作り、上のVercel URLを設定する。
5. default branchが`main`であることを確認する。
6. `main`へpushするか、Actionsから「Deploy GitHub Pages」を手動実行する。

[deploy workflow](../.github/workflows/deploy-pages.yml)は`npm ci`、`npm run check`、`dist/`のupload、Pages deploymentを順番に行います。repository名からViteのbase pathを自動設定するため、project siteと`<user>.github.io` repositoryの両方に対応します。

## 公開後に行う設定

このrepositoryの公開URL:

```text
https://yhcfu.github.io/showroom-pip-pwa/
```

利用するURLは次の2つです。

```text
PWA:       https://yhcfu.github.io/showroom-pip-pwa/app/
Player:    https://yhcfu.github.io/showroom-pip-pwa/player/
```

公開版はPC、iPhone、Androidのすべてで同じ動画専用Playerを開きます。追加の配布物はありません。

## デプロイしないもの

- SHOWROOMのCookieやsession
- HLS manifestや動画segment
- HLS URLのdatabaseやログ
- ルーム履歴
- 動画proxy、定期polling、Web Push sender

Resolverが扱うのはroom keyと、その時点の公開配信メタデータだけです。永続化はしません。

バックグラウンド通知は[後続フェーズ](server-phase.md)です。

## 以前のroot版PWAから更新する場合

旧版の`/sw.js`は、このdeploymentでcache削除と登録解除だけを行う移行用Service Workerへ置き換わります。旧版をインストール済みの場合は、公開ページを一度オンラインで開いてから既存アイコンを削除し、新しい`/app/`をホーム画面へ追加し直してください。
