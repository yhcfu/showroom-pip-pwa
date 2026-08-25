# 構成

## 現在の構成

```text
GitHub Pages
├─ /app/       インストール対象PWA、入力、端末内履歴
└─ /player/    PWA scope外の全画面動画プレイヤー

PC PWA ── /player/?room=... ── Vercel Resolver ── SHOWROOM JSON API
               │                       │
               └──── HLS URLのみ返す ──┘
               └──────────────────────── SHOWROOM HLS CDN

iPhone PWA ── shortcuts:// ── Appleショートカット
                                  ├─ SHOWROOM JSON API
                                  └─ /player/#stream=... ── Safari PiP

Android PWA ── SHOWROOMルームページ ── bookmarklet
                                          ├─ SHOWROOM JSON API
                                          └─ /player/#stream=... ── Chrome PiP

/player/ <video> ── SHOWROOM HLS CDN
```

PWAとplayerは同じGitHub Pages deploymentにあります。ただしWeb App ManifestとService Workerのscopeは`/app/`だけです。`/player/`を外へ置くことで、iOSのショートカットが開いた動画URLをstandalone PWAへ戻しません。

## データの扱い

履歴は`localStorage`だけに保存します。Androidや通常ブラウザでは`/app/`と`/player/`が同じstorageを使うため、Playerが受け取った`room_id`、`room_url_key`、`room_name`をPWAの履歴へ反映できます。

iPhoneのホーム画面Web AppはSafariとstorageが分離されます。iOS経路ではPWAへ入力した`room_url_key`だけがPWA側に残り、Safari Player側のroomIdとroom名はPWAへ同期されません。PCは同じoriginのPlayerでResolver結果を保存できるため、roomIdで重複を除けます。

HLS URLはURL fragmentの`#stream=...`で渡します。fragmentはGitHub PagesへのHTTP requestに含まれません。ただしブラウザ履歴やクリップボードには残るため、再生リンクは共有しないでください。

## 視聴経路

- Safari: native HLSを`<video playsinline controls>`へ設定し、標準PiP APIまたはWebKit presentation modeを使う。
- Android Chrome: HLS.jsでmaster playlistを読み、標準`requestPictureInPicture()`を使う。
- iOS standalone PWA: 動画を読み込まず、scope外のSafari playerへ渡す。
- PC: Resolverから受け取ったHLSをHLS.jsで再生する。Playerはvisual viewport全体を使い、動画を切り取らずウィンドウへ追従する。全画面はFullscreen APIを使う。

映像はSHOWROOMのCDNから端末へ直接流れます。GitHub PagesとVercel Resolverは映像を中継しません。
