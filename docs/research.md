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

その差を端末側だけで吸収するため、次の2経路に限定しました。

- iPhone: AppleショートカットのHTTPアクションで取得する。
- Android: SHOWROOMページ上のブックマークレットでsame-origin取得する。
- PC: 小さなsame-origin許可済みResolverでHLS URLを取得し、PWAの動画専用Playerで再生する。

## WASMでは解決しない

WASMのネットワーク処理も、ブラウザ内では`fetch`やWebSocketなどのWeb APIを経由します。Service Workerも同じです。したがって、WASMへ抽出処理を移植してもsame-origin policyやCORSを回避できません。

WASMが有効なのは、取得済みデータの解析やcodec処理です。今回詰まっているのは計算処理ではなく、別originのresponseをJavaScriptから読めないことなので、解決手段にはなりません。

## 最小のサーバーを採用する判断

PCでもSHOWROOM UIを除いたPlayerを提供するには、ブラウザ外でAPIを2回呼ぶ処理だけは必要です。そこでVercel Functionを採用し、状態保存、動画proxy、定期実行を持たせません。映像帯域はVercelを通らず、利用者のブラウザがSHOWROOM CDNから直接受け取ります。

バックグラウンド通知に必要な状態管理と定期実行は、引き続き[サーバーフェーズ](server-phase.md)へ分離します。
