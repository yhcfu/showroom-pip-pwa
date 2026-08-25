# SHOWROOM PiP PWA

SHOWROOMの公開ライブを、映像だけで見るための個人用PWAです。PCではウィンドウに追従する専用プレイヤーを使えます。iPhoneとAndroidはPicture-in-Picture（PiP）に対応します。画面はGitHub Pagesに置き、PC向けの配信URL解決だけを無料枠のVercel Functionへ任せます。

公開版: [SHOWROOM PiPを開く](https://yhcfu.github.io/showroom-pip-pwa/app/)

## 端末ごとの動き

- iPhone/iPad: 初回だけサイトから署名済みApple Shortcutを追加する。PWAから起動後、端末上でSHOWROOM APIを取得し、Safariのプレイヤーへ渡す。
- PC: 初回設定は不要。同じタブの動画専用プレイヤーへ移動する。動画はウィンドウ全体に収まり、全画面表示も使える。
- Android: SHOWROOMのルームページを開き、保存済みブックマークレットでHLS URLを取得する。結果はChromeなどのプレイヤーへ渡す。
- 取得済みHLS URL: PWAへ直接入力してプレイヤーを開ける。

PWAは`/app/`、動画プレイヤーは`/player/`へ分けています。インストール対象のscopeからプレイヤーを外すことで、iPhoneでも動画をstandalone PWAへ戻さずSafariで開けます。

## 履歴

一度開いたルームは`localStorage`へ最大20件保存します。PCとAndroidではPlayerが`room_id`を受け取った後、URL keyが変わっても同じroomIdなら1件に統合します。iPhoneのPWA側はroom keyで重複を除きます。履歴はサーバーへ送信しません。

## 小さなResolverが必要な理由

SHOWROOMのJSON APIには外部サイト向けCORSがありません。Service WorkerやWASMでも、この制約は越えられません。PCではVercel Functionが配信状態と公開HLS URLだけを取得します。映像はSHOWROOMのCDNからブラウザへ直接流れ、Cookie、履歴、動画はResolverへ送りません。

PWAを閉じている間の配信ポーリングとWeb Push通知は、現在のscope外です。

バックグラウンド通知を追加する場合の設計条件は[サーバーフェーズ](docs/server-phase.md)へ分離しました。現行UIには、動作しない通知スイッチやResolver設定を置いていません。

## ローカル起動と検証

```bash
npm install
VITE_RESOLVER_URL=https://your-resolver.vercel.app npm run dev
npm run check
```

開発サーバーでは次のURLを使います。

- PWA: `http://localhost:5173/app/`
- プレイヤー: `http://localhost:5173/player/`

## デプロイ

まずVercelへResolverをdeployし、そのURLをGitHub Actionsの`RESOLVER_URL` repository variableへ設定します。その後、`.github/workflows/deploy-pages.yml`が`main`へのpushでテスト、build、GitHub Pagesへのdeployを行います。詳しくは[デプロイ手順](docs/deployment.md)を参照してください。

## ドキュメント

- [構成とデータフロー](docs/architecture.md)
- [iPhoneショートカット](docs/ios-shortcut.md)
- [Androidブックマークレット](docs/bookmarklet.md)
- [GitHub PagesとResolverのデプロイ](docs/deployment.md)
- [履歴と通知の境界](docs/history-and-notifications.md)
- [既存実装・WASM・CORSの調査](docs/research.md)
- [制約と利用上の注意](docs/limitations.md)
- [後続のサーバーフェーズ](docs/server-phase.md)

## 対応範囲

公開中の無料ライブだけを対象にします。ログイン、Cookie転送、コメント、ギフト、有料・限定配信、録画、再配信には対応しません。SHOWROOMの公式プロダクトではなく、非公開APIの変更で動かなくなる可能性があります。
