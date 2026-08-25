# SHOWROOM PiP PWA

SHOWROOMの公開ライブを履歴からすぐ開くための個人用PWAです。iPhoneとAndroidではPicture-in-Picture（PiP）、PCでは公式プレイヤーの通常表示とシアター表示を使います。現在の構成はGitHub Pagesだけで動き、Cloudflare Workerなどの常設サーバーを使いません。

公開版: [SHOWROOM PiPを開く](https://yhcfu.github.io/showroom-pip-pwa/app/)

## 端末ごとの動き

- iPhone/iPad: 初回だけサイトから署名済みApple Shortcutを追加する。PWAから起動後、端末上でSHOWROOM APIを取得し、Safariのプレイヤーへ渡す。
- PC: 初回設定は不要。履歴や入力欄からSHOWROOM公式プレイヤーを通常タブ、またはシアターサイズの専用ウィンドウで開く。
- Android: SHOWROOMのルームページを開き、保存済みブックマークレットでHLS URLを取得する。結果はChromeなどのプレイヤーへ渡す。
- 取得済みHLS URL: PWAへ直接入力してプレイヤーを開ける。

PWAは`/app/`、動画プレイヤーは`/player/`へ分けています。インストール対象のscopeからプレイヤーを外すことで、iPhoneでも動画をstandalone PWAへ戻さずSafariで開けます。

## 履歴

一度開いたルームは`localStorage`へ最大20件保存します。AndroidではPlayerが`room_id`を返した後、URL keyが変わっても同じroomIdなら1件に統合します。PCとiPhoneのPWA側はroom keyで重複を除きます。履歴はサーバーへ送信しません。

## サーバーなしでできないこと

SHOWROOMのJSON APIには外部サイト向けCORSがありません。Service WorkerやWASMを使っても、この制約は越えられません。そのため、PWAを閉じている間の配信ポーリングとWeb Push通知は現在のscope外です。

バックグラウンド通知を追加する場合の設計条件は[サーバーフェーズ](docs/server-phase.md)へ分離しました。現行UIには、動作しない通知スイッチやResolver設定を置いていません。

## ローカル起動と検証

```bash
npm install
npm run dev
npm run check
```

開発サーバーでは次のURLを使います。

- PWA: `http://localhost:5173/app/`
- プレイヤー: `http://localhost:5173/player/`

## デプロイ

`.github/workflows/deploy-pages.yml`が`main`へのpushでテスト、build、GitHub Pagesへのdeployを行います。最初にrepositoryのSettings → Pages → Sourceを「GitHub Actions」へ変更してください。詳しくは[デプロイ手順](docs/deployment.md)を参照してください。

## ドキュメント

- [構成とデータフロー](docs/architecture.md)
- [iPhoneショートカット](docs/ios-shortcut.md)
- [Androidブックマークレット](docs/bookmarklet.md)
- [GitHub Pagesへのデプロイ](docs/deployment.md)
- [履歴と通知の境界](docs/history-and-notifications.md)
- [既存実装・WASM・CORSの調査](docs/research.md)
- [制約と利用上の注意](docs/limitations.md)
- [後続のサーバーフェーズ](docs/server-phase.md)

## 対応範囲

公開中の無料ライブだけを対象にします。ログイン、Cookie転送、コメント、ギフト、有料・限定配信、録画、再配信には対応しません。SHOWROOMの公式プロダクトではなく、非公開APIの変更で動かなくなる可能性があります。
