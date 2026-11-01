# SHOWROOM PiP PWA

SHOWROOMの公開ライブを、映像だけで見る個人用PWAです。操作はどの端末でも同じです。ルームを選ぶと動画専用プレイヤーが開き、PCでは全画面、iPhoneとAndroidではPicture-in-Picture（PiP）を利用できます。画面はGitHub Pagesに置き、配信URL解決だけを無料枠のVercel Functionへ任せます。

公開版: [SHOWROOM PiPを開く](https://yhcfu.github.io/showroom-pip-pwa/app/)

## 使い方

1. SHOWROOMのルームURLを貼り付けるか、履歴から選ぶ。
2. 「開く」を押す。
3. PCではウィンドウ追従表示または全画面、スマートフォンではPiPを使う。

Playerの`URL`は、ルームの共有用URLをコピーします。カメラボタンは、表示中の動画をPNGで保存します。対応ブラウザでは同じ画像がクリップボードにも入ります。PCでは`S`キーも使えます。

ローカルのMPEG-TS（`.ts`）をPlayerへドロップすると、ブラウザ内でMP4へ組み替えます。そのまま再生でき、映像は外部へ送信しません。変換後のMP4はブラウザ専用の一時ファイルへ置き、Playerを閉じると削除します。対応するChrome/Edgeでは、配信と同じ切り出し画面からMP4として保存できます。

PC Chrome/EdgeとAndroidでは、取得済み映像を端末内へ最長24時間保持します。リロード後も前回位置から再開できます。シークバーを戻せば、古い位置から追っかけ再生できます。保存区間を最後まで再生すると、自動で現在のライブへ合流します。

はさみボタンを押すと、保存済み映像またはドロップしたTSファイルの開始位置と終了位置をスライダーで指定できます。1回に切り出せる長さは最大1分です。「現在」は、再生中の位置を開始または終了へ設定するボタンです。

プレビューは選んだ範囲を再生でき、終了位置で止まります。音も出ます。音声が出ている間は、メイン動画の音量を8%以下へ下げます。

MP4はブラウザ内で作ります。そのため、所要時間は選んだ区間と同じです。作成中も通常のプレイヤーを使えます。別のタブへ移動した場合は作成を止め、戻ると再開します。

容量は最大1 GiBを目安に、端末の空き容量へ合わせて縮小します。上限に達した場合は古い映像から削除します。Safariで戻れる範囲はブラウザと配信側のplaylistに依存します。

`L/R`はPC版Chrome/Edge限定です。音声の左右バランスを調整できます。

再生には、SHOWROOMが返す固定画質HLSのうち、`quality`が最も高いものを使います。固定画質がない配信では自動画質HLSを使い、その中の最高レベルを選びます。

初回設定はありません。Shortcut、ブックマークレット、ブラウザ拡張も不要です。PWAは`/app/`、動画プレイヤーは`/player/`へ分け、Playerをインストール対象のscopeから外しています。

## 履歴

一度開いたルームは`localStorage`へ保存します。通常履歴は最大20件です。ピン固定したルームは別枠で上部に残ります。Playerが`room_id`を受け取った後は、URL keyが変わっても同じroomIdなら1件です。履歴はサーバーへ送りません。

## 小さなResolverが必要な理由

SHOWROOMのJSON APIには外部サイト向けCORSがありません。Service WorkerやWASMでも越えられないため、Vercel Functionが全端末の配信状態と公開HLS URLだけを取得します。映像はSHOWROOMのCDNからブラウザへ直送されます。Cookie、履歴、動画はResolverへ送りません。

PWAを閉じている間の配信ポーリングとWeb Push通知は、現在のscope外です。

すべてのHTMLページで`noindex`を宣言しています。検索結果、snippet、画像indexに出さないための指定です。Googleがこの指定を取得できるよう、`robots.txt`ではページを遮断しません。

なお、GitHub Pagesでは任意のbotへHTTP 403を返せません。アクセスそのものを拒否するには、認証付きhostingかedge制御が必要です。

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

公開中の無料ライブだけを対象にします。ログイン、Cookie転送、コメント、ギフト、有料・限定配信、再配信には対応しません。MP4切り出しは、端末内の保存済み映像を私的使用の範囲で保存する機能です。SHOWROOMの公式プロダクトではなく、非公開APIの変更で動かなくなる可能性があります。
