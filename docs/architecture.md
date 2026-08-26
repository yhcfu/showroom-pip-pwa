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

Resolverは`streaming_url_list`から`hls / original quality`を優先します。固定画質がない場合だけ`hls_all`へ戻します。このfallbackをHLS.jsで再生する端末では、manifest内の最大解像度・最大bitrateのlevelを固定します。

PC Chrome/Edgeでは、OSがnative HLSを提供する場合もHLS.js/MSEを優先します。利用者が`L/R`を操作した時だけ`AudioContext`を作り、`MediaElementAudioSourceNode → StereoPannerNode → destination`へ接続します。値は端末内へ保存します。スマートフォンではL/Rを提供しません。SafariはWebKitの既知問題を避けるためnative HLSを使い、UIも表示しません。

HLS.jsのback bufferには時間制限を設けません。media fragmentはIndexedDBにも複製します。再生位置は`localStorage`へ同期します。

リロード時は、保存位置を含む連続segmentから一時的なVOD playlistを組み立てます。再生は保存位置から始まり、native timelineで巻き戻しと追っかけ再生を扱います。保存区間の終端へ実際に到達した場合だけ、一時playlistを破棄して現在のlive HLSへ自動で接続します。終端付近にいるだけでは再生位置を動かしません。

端末内bufferの保持期限は24時間、希望上限は1 GiBです。空き容量が少ない端末では、`StorageManager.estimate()`を使って上限を縮めます。期限切れまたは古いsegmentから削除します。

映像payloadとmetadataは別object storeへ置きます。そのため、容量整理の際に全映像をメモリへ展開しません。暗号化fragment、部分fragment、連続性を確認できない区間は復元対象外です。Safariのnative HLSも対象外です。

スマートフォンなどのcoarse pointer環境では、独自ツールバーと`<video controls>`を上下の別領域に配置します。PCでは独自ツールバーを映像上へ重ねます。再生中にポインター・キーボード入力が0.9秒なければ隠し、入力時は即座に戻します。マウスクリックでボタンにフォーカスが残っても表示を固定しません。一時停止中、バッファリング中、キーボードでツールへフォーカスしている間、L/Rパネルの表示中、エラー表示中は隠しません。

映像はSHOWROOMのCDNから端末へ直接流れます。GitHub PagesとVercel Resolverは映像を中継しません。
