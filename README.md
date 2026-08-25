# SHOWROOM PiP PWA

SHOWROOMの公開ライブ配信をHLSとして読み込み、ブラウザのPicture-in-Picture（PiP）で再生する個人用・実験用PWAです。SHOWROOMの公式プロダクトではありません。

## 先に知っておくこと

- SHOWROOMページの`iframe`埋め込みは`X-Frame-Options: DENY`で拒否されます。
- SHOWROOMの非公開APIは、外部サイト向けCORSヘッダーを返しません。GitHub PagesのJavaScriptだけではルームURLからHLS URLを取得できません。
- WASMもブラウザ内では同一生成元ポリシーに従うため、このCORS制約を回避できません。
- iPhone/iPadのホーム画面に追加したstandalone PWAでは、WebKitの既知問題によりPiPを開始できません。通常のSafariでプレイヤーを開く必要があります。
- HLS URL取得後の動画本体はCDNから端末へ直接流れます。付属Resolverは動画を中継しません。

## 履歴と配信検知

- 一度入力したルームは端末内へ最大20件保存します。
- Resolverまたは端末Bridgeから取得した`room_id`で重複を除きます。
- 履歴から1タップで再取得できます。
- 配信検知をONにすると、PWAを開いている間は60秒ごとにまとめて確認します。
- 対応AndroidではPeriodic Background Syncも試します。付属WorkerへD1、Cron、Web Pushを設定すると、閉じたiPhone/Androidにも通知できます。
- iPhoneで通知を使うための「ホーム画面に追加」手順は、未追加時にサイト上へ表示します。

## 用意した3経路

1. **完全サーバーレス（iPhone推奨）**: PWAからAppleショートカットを起動し、端末上でSHOWROOM APIを取得してSafariプレイヤーへ渡す。
2. **完全サーバーレス（手動）**: SHOWROOMページ上のブックマークレット、または取得済みHLS URLを直接入力する。
3. **通常操作が最も簡単**: GitHub Pages + 無料枠のCloudflare Worker。ルームURLの解決と、任意で閉じた端末へのWeb Pushを行う。

## ローカル起動

```bash
npm install
npm run dev
```

任意のResolverもローカルで動かす場合:

```bash
npm run dev:resolver
```

PWAの「設定 / HLS URLを直接指定」で`http://localhost:8787`をResolver URLに指定します。Worker側の`ALLOWED_ORIGINS`は既定で`http://localhost:5173`です。

## 検証

```bash
npm run check
```

## ドキュメント

- [調査結果と既存実装](docs/research.md)
- [構成とデータフロー](docs/architecture.md)
- [iPhoneショートカット（サーバー不要）](docs/ios-shortcut.md)
- [ブックマークレット（サーバー不要）](docs/bookmarklet.md)
- [GitHub Pages / Cloudflareへのデプロイ](docs/deployment.md)
- [履歴・配信検知・通知](docs/history-and-notifications.md)
- [制約・利用上の注意](docs/limitations.md)

## 対応範囲

公開中の無料ライブのみを対象にします。ログイン、Cookie転送、コメント、ギフト、有料・限定配信、録画、再配信には対応しません。非公開APIの仕様変更で突然動かなくなる可能性があります。
