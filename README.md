# SHOWROOM PiP PWA

SHOWROOMの公開ライブを、映像だけで見る個人用PWAです。操作はどの端末でも同じです。ルームを選ぶと動画専用プレイヤーが開き、PCでは全画面、iPhoneとAndroidではPicture-in-Picture（PiP）を利用できます。画面はGitHub Pagesに置き、配信URL解決だけを無料枠のVercel Functionへ任せます。

公開版: [SHOWROOM PiPを開く](https://yhcfu.github.io/showroom-pip-pwa/app/)

## 使い方

1. SHOWROOMのルームURLを貼り付けるか、履歴から選ぶ。
2. 「開く」を押す。
3. PCではウィンドウ追従表示または全画面、スマートフォンではPiPを使う。

Playerの`URL`は、ルームの共有用URLをコピーする操作です。Chrome、Edge、Androidでは`L/R`からPlayer音声の左右バランスを調整できます。Safariには互換性の問題があるため、この操作を表示しません。

初回設定はありません。Shortcut、ブックマークレット、ブラウザ拡張も不要です。PWAは`/app/`、動画プレイヤーは`/player/`へ分け、Playerをインストール対象のscopeから外しています。

## 履歴

一度開いたルームは`localStorage`へ保存します。通常履歴は最大20件です。ピン固定したルームは別枠で上部に残ります。Playerが`room_id`を受け取った後は、URL keyが変わっても同じroomIdなら1件です。履歴はサーバーへ送りません。

## 小さなResolverが必要な理由

SHOWROOMのJSON APIには外部サイト向けCORSがありません。Service WorkerやWASMでも越えられないため、Vercel Functionが全端末の配信状態と公開HLS URLだけを取得します。映像はSHOWROOMのCDNからブラウザへ直送されます。Cookie、履歴、動画はResolverへ送りません。

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
- [GitHub PagesとResolverのデプロイ](docs/deployment.md)
- [履歴と通知の境界](docs/history-and-notifications.md)
- [既存実装・WASM・CORSの調査](docs/research.md)
- [制約と利用上の注意](docs/limitations.md)
- [後続のサーバーフェーズ](docs/server-phase.md)

## 対応範囲

公開中の無料ライブだけを対象にします。ログイン、Cookie転送、コメント、ギフト、有料・限定配信、録画、再配信には対応しません。SHOWROOMの公式プロダクトではなく、非公開APIの変更で動かなくなる可能性があります。
