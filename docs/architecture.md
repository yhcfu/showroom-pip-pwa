# 構成

## 現在の構成

```text
GitHub Pages
├─ /app/       インストール対象PWA、入力、端末内履歴
└─ /player/    PWA scope外の動画プレイヤー

iPhone PWA ── shortcuts:// ── Appleショートカット
                                  ├─ SHOWROOM JSON API
                                  └─ /player/#stream=... ── Safari PiP

Android PWA ── SHOWROOMルームページ ── bookmarklet
                                          ├─ SHOWROOM JSON API
                                          └─ /player/#stream=... ── Chrome PiP

PC PWA ── SHOWROOM公式プレイヤー
          ├─ 通常タブ
          └─ 再利用するシアターウィンドウ

/player/ <video> ── SHOWROOM HLS CDN
```

PWAとplayerは同じGitHub Pages deploymentにあります。ただしWeb App ManifestとService Workerのscopeは`/app/`だけです。`/player/`を外へ置くことで、iOSのショートカットが開いた動画URLをstandalone PWAへ戻しません。

## データの扱い

履歴は`localStorage`だけに保存します。Androidや通常ブラウザでは`/app/`と`/player/`が同じstorageを使うため、Playerが受け取った`room_id`、`room_url_key`、`room_name`をPWAの履歴へ反映できます。

iPhoneのホーム画面Web AppはSafariとstorageが分離されます。iOS経路ではPWAへ入力した`room_url_key`だけがPWA側に残り、Safari Player側のroomIdとroom名はPWAへ同期されません。PCも公式プレイヤーから情報を取得しないため、PCとiOSの履歴はroom keyで重複を除きます。

HLS URLはURL fragmentの`#stream=...`で渡します。fragmentはGitHub PagesへのHTTP requestに含まれません。ただしブラウザ履歴やクリップボードには残るため、再生リンクは共有しないでください。

## 視聴経路

- Safari: native HLSを`<video playsinline controls>`へ設定し、標準PiP APIまたはWebKit presentation modeを使う。
- Android Chrome: HLS.jsでmaster playlistを読み、標準`requestPictureInPicture()`を使う。
- iOS standalone PWA: 動画を読み込まず、scope外のSafari playerへ渡す。
- PC: HLSを抽出せず、SHOWROOM公式プレイヤーを新しいタブまたは16:9に近い専用ウィンドウで開く。全画面は公式プレイヤー側の操作を使う。

映像はSHOWROOMのCDNから端末へ直接流れます。GitHub Pagesは映像を中継しません。
