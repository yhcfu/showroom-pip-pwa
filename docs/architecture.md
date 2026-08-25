# 構成

## 推奨構成

```text
GitHub Pages PWA
  ├─ iPhone: shortcuts:// → Appleショートカット → SHOWROOM JSON API
  │                                             └→ Safari player#stream=...
  └─ Android/Desktop: Cloudflare Worker /resolve → SHOWROOM JSON API
                                                └→ player#stream=...

player <video> ─────────────────────────────────→ SHOWROOM HLS CDN

Cloudflare Cron → Worker /status → D1の直前状態と比較
                                  └→ OFF→LIVEだけWeb Push → iPhone / Android
```

履歴はPWAの`localStorage`だけに保存します。`room_id`を取得できた時点で同じルームを統合します。配信検知はPWAからResolverの`/status`へ最大20件をまとめて渡し、画面表示中は60秒ごとに状態変化を確認します。

映像はSHOWROOM側CDNから端末へ直接取得します。ここはWorkerを通りません。

Workerは`room_url_key`から公開HLS master URLを解決します。Web Pushを有効にした場合だけ、Push購読情報・監視対象・直前のLIVE状態をD1へ保存します。

## URL fragmentを使う理由

プレイヤーへの引き渡しは`#stream=<percent-encoded HLS URL>`です。fragmentはHTTPリクエストでGitHub Pagesへ送信されません。そのため、CDN URLがPagesのアクセスログへ入るのを避けられます。

ただし、ブラウザ履歴やクリップボードには残り得ます。再生リンクは共有しないでください。

## Resolverの境界

付属Workerは以下に限定しています。

- 入力はSHOWROOMの`/r/<key>` URLまたは厳格な`room_url_key`だけ
- 接続先はコード内で固定した`https://www.showroom-live.com`だけ
- タイムアウトは5秒
- Cookie・認証情報を受け取らない、転送しない
- `hls_all`、なければ公開`hls`だけを返す
- `/status`は最大20件の固定形式room keyだけを受け付ける
- `/push/subscription`は共有の`WATCH_TOKEN`が一致するときだけ更新できる
- HLS URLをキャッシュ・保存しない
- CORSは`ALLOWED_ORIGINS`に列挙した自分のPages originだけ

一般URLを受け取るCORS proxyにはしていません。

## PiP経路

- Chrome/Edge等: 標準`HTMLVideoElement.requestPictureInPicture()`
- Safari: native HLSを`<video playsinline controls>`へ設定し、標準APIまたはWebKit presentation modeを試す
- iOS standalone PWA: 現在のWebKit既知問題を避け、ショートカットから通常Safariへ開く

HLS.jsはnative HLSのないブラウザでのみ使用します。
