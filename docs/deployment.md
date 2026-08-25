# GitHub Pagesへのデプロイ

現在の構成で必要な外部サービスはGitHub Pagesだけです。Cloudflare account、database、secretは使いません。

## 初回設定

1. repositoryをGitHubへpushする。
2. GitHubのSettings → Pagesを開く。
3. Build and deploymentのSourceで「GitHub Actions」を選ぶ。
4. default branchが`main`であることを確認する。
5. `main`へpushするか、Actionsから「Deploy GitHub Pages」を手動実行する。

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

Player URLを使って[iPhoneショートカット](ios-shortcut.md)を作ります。PCはPWAの「SHOWROOM PiP」ボタンをブックマークバーへドラッグします。AndroidはPWAからブックマークレットをコピーし、既存ブックマークのURL欄へ貼り付けます。どちらも公開中のPlayer URLは自動で埋め込まれます。

## デプロイしないもの

- SHOWROOMのCookieやsession
- HLS manifestや動画segment
- HLS URLのdatabaseやログ
- ルーム履歴
- API proxy、定期polling、Web Push sender

バックグラウンド通知は[後続フェーズ](server-phase.md)です。

## 以前のroot版PWAから更新する場合

旧版の`/sw.js`は、このdeploymentでcache削除と登録解除だけを行う移行用Service Workerへ置き換わります。旧版をインストール済みの場合は、公開ページを一度オンラインで開いてから既存アイコンを削除し、新しい`/app/`をホーム画面へ追加し直してください。
