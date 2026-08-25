# 構成

## 推奨構成

```text
GitHub Pages PWA
  ├─ iPhone: shortcuts:// → Appleショートカット → SHOWROOM JSON API
  │                                             └→ Safari player#stream=...
  └─ Android/Desktop: Cloudflare Worker /resolve → SHOWROOM JSON API
                                                └→ player#stream=...

player <video> ─────────────────────────────────→ SHOWROOM HLS CDN
```

映像はSHOWROOM側CDNから端末へ直接取得します。Workerの役割は小さく、`room_url_key`から公開HLS master URLを解決するだけです。

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
- HLS URLをキャッシュ・保存しない
- CORSは`ALLOWED_ORIGINS`に列挙した自分のPages originだけ

一般URLを受け取るCORS proxyにはしていません。

## PiP経路

- Chrome/Edge等: 標準`HTMLVideoElement.requestPictureInPicture()`
- Safari: native HLSを`<video playsinline controls>`へ設定し、標準APIまたはWebKit presentation modeを試す
- iOS standalone PWA: 現在のWebKit既知問題を避け、ショートカットから通常Safariへ開く

HLS.jsはnative HLSのないブラウザでのみ使用します。
