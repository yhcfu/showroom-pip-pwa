# 既存実装・WASM・CORSの調査

## 結論

公開URLを渡すだけで、ブラウザから利用できるSHOWROOM専用の無償Resolverは確認できませんでした。既存OSSはURL抽出の参考にはなりますが、GitHub Pages上のPWAへそのまま埋め込める部品ではありません。

| 実装 | 主用途 | PWAだけで使えない理由 |
| --- | --- | --- |
| [Streamlink](https://github.com/streamlink/streamlink) | Python CLIでストリームを抽出・再生 | Python実行環境と通常のHTTP clientを前提とする |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Python CLIで情報抽出・取得 | ブラウザのCORS制約外で動くCLIである |
| [streamlink-server](https://github.com/streamlink/streamlink-server) | StreamlinkをHTTP API化 | 自分で常設サーバーを動かす必要がある |
| [livestreamer](https://github.com/chrippa/livestreamer) | Streamlinkの前身 | archivedで、ブラウザ組み込み用途ではない |

第三者の公開Resolverは、停止・仕様変更・ログ取得・悪用防止制限をこちらで管理できません。HLS URLや閲覧対象を他人のサーバーへ渡すことにもなるため、現行構成の依存先にはしません。

## APIとiframe

SHOWROOMのルームページはiframe埋め込みを拒否します。また、ルーム状態とstreaming URLのJSON endpointはSHOWROOMページからは取得できますが、GitHub Pagesのoriginから直接`fetch`するためのCORS許可はありません。

Resolver導入前は、その差を端末側で吸収する必要がありました。

- iPhone: AppleショートカットのHTTPアクションで取得する案。
- Android: SHOWROOMページ上のブックマークレットでsame-origin取得する案。

現在は廃止しています。全端末が同じResolverを使い、PWAはroom keyだけをPlayerへ渡します。

## WASMでは解決しない

WASMのネットワーク処理も、ブラウザ内では`fetch`やWebSocketなどのWeb APIを経由します。Service Workerも同じです。したがって、WASMへ抽出処理を移植してもsame-origin policyやCORSを回避できません。

WASMが有効なのは、取得済みデータの解析やcodec処理です。今回詰まっているのは計算処理ではなく、別originのresponseをJavaScriptから読めないことなので、解決手段にはなりません。

## 最小のサーバーを採用する判断

SHOWROOM UIを除いたPlayerには、ブラウザ外でAPIを2回呼ぶ処理だけが必要です。そこでVercel Functionを採用しました。状態保存、動画proxy、定期実行は持たせず、映像帯域もVercelを通しません。

バックグラウンド通知に必要な状態管理と定期実行は、引き続き[サーバーフェーズ](server-phase.md)へ分離します。

## ブラウザ内のL/Rバランス

Web Audio APIの`StereoPannerNode`は、左右定位を連続値で指定できます。Playerでは`HTMLMediaElement`を`createMediaElementSource()`で音声グラフへ取り込み、pannerを経由して出力します。操作はL/Rを表す1本のスライダーです。

- [MDN: Using the Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API) — media elementを音声グラフへ接続する基本形とstereo pannerの例
- [Web Audio API specification: MediaElementAudioSourceNode security](https://www.w3.org/TR/webaudio-1.0/#MediaElementAudioSourceNode-security) — cross-origin mediaはCORS許可がない場合に無音を出力する要件
- [WebKit bug 180696](https://bugs.webkit.org/show_bug.cgi?id=180696) — SafariのHLSを`createMediaElementSource()`へ接続すると無音になる未解決報告
- [WebKit bug 306493](https://bugs.webkit.org/show_bug.cgi?id=306493) — 新しいSafariでも再現する関連報告

SHOWROOMのHLS CDNが現在の公開Player originへCORS応答を返すことは確認済みです。ただし、配信側の挙動は変わる可能性があります。そのため、L/Rを有効にするのはfine pointerを持つPCのHLS.js/MSE経路だけです。スマートフォンとnative HLSを選ぶSafariではUIごと隠します。初期化に失敗しても映像再生は継続し、L/Rだけを無効化します。
