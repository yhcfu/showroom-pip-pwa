# 構成

## 現在の構成

```text
GitHub Pages
├─ /app/       インストール対象PWA、入力、端末内履歴
└─ /player/    PWA scope外の全画面動画プレイヤー

PC / iPhone / Android
       └─ /player/?room=... ── Vercel Resolver ── SHOWROOM JSON API
                  │                    │
                  └─ HLS URLのみ返す ──┘
                  └───────────────────── SHOWROOM HLS CDN

/player/ <video> ── SHOWROOM HLS CDN
```

PWAとPlayerは同じGitHub Pages deploymentにあります。Web App ManifestとService Workerのscopeは`/app/`だけです。`/player/`を外へ置き、iOSでもブラウザの動画表示として開けるようにします。

## データの扱い

履歴とピン状態は`localStorage`だけに保存します。`/app/`と`/player/`は同じoriginです。Playerが受け取った`room_id`、`room_url_key`、`room_name`を履歴へ反映できます。

iPhoneのホーム画面Web AppとSafariのstorageが分離される環境では、PWA側に保存済みのroom keyで重複を除きます。再生方法は他端末と同じです。

解決済みHLS URLは、再読み込み用にURL fragmentの`#stream=...`へ保持します。fragmentはGitHub PagesへのHTTP requestに含まれません。Playerの`URL`操作でコピーするのは、Resolverで再解決できる`/player/?room=...`だけです。HLSを直接入力した場合は安定したルーム識別子がないため、共有操作を表示しません。

## 視聴経路

- 全端末: `/player/?room=...`がResolverへroom keyを渡し、返されたHLSを`<video playsinline controls>`へ設定する。
- Safari: native HLSと標準PiP APIまたはWebKit presentation modeを使う。
- Chrome/Edge: HLS.jsと`requestPictureInPicture()`を使う。PCではFullscreen APIも使える。

Chrome/EdgeのHLS.js経路では、利用者が`L/R`を操作した時だけ`AudioContext`を作ります。音声グラフは`MediaElementAudioSourceNode → StereoPannerNode → destination`です。値は端末内へ保存します。Safariのnative HLS経路ではWebKitの既知問題を避けるため、この音声グラフを作らずUIも表示しません。

映像はSHOWROOMのCDNから端末へ直接流れます。GitHub PagesとVercel Resolverは映像を中継しません。
