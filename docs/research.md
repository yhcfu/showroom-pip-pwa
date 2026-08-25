# 調査結果: 既存ResolverとWASM

調査日: 2026-08-25

## 結論

HLS URLを取り出すオープンソース実装は複数あります。一方で、任意のSHOWROOMルームを受け付け、ブラウザ向けCORSを備え、継続利用を期待できる公開Resolverサービスは確認できませんでした。そのため、第三者の公開URLへ依存せず、端末内ショートカットか自分の無料Workerを使う構成にしています。

## 見つかった既存実装

| 実装 | 形態 | このPWAから直接利用 | 判断 |
|---|---|---:|---|
| [Streamlink SHOWROOM plugin](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/showroom.py) | Python CLI/plugin | 不可 | `streaming_url`から`hls_all`を選ぶ現行ロジックの参考になる |
| [yt-dlp SHOWROOM extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/showroomlive.py) | Python CLI/library | 不可 | ローカル/サーバーでの抽出用途。公開Resolverではない |
| [wlerin/showroom](https://github.com/wlerin/showroom) | Python非公式API client | 不可 | API wrapperであり、ホスト済みサービスではない |
| [JKT48ShowroomM3U](https://github.com/dandyraka/JKT48ShowroomM3U) | Node生成スクリプト | 不可 | 固定対象のM3Uを生成。汎用Resolverではない |
| [crstlnz/jkt48showroom-api](https://github.com/crstlnz/jkt48showroom-api) | Hono API | 条件付き | `/streaming_url` routeはあるが、2026-08-25時点で公開先はVercelの`DEPLOYMENT_DISABLED` |
| [SHOWROOM HLS bookmarklet gist](https://gist.github.com/noromanba/34b7ba05dbccb4fa844c18a88ff38d89) | bookmarklet | 同一ページ上のみ | 古いが、SHOWROOM origin上で抽出するサーバーレス発想は現在も有効 |

既存ライブラリをCloudflare Workerへそのまま載せるより、必要な2 APIだけを呼ぶ小さなResolverの方が依存・攻撃面・無料枠CPUを小さくできます。

## APIとCORSの実測

公開ライブでは次の流れでHLS master URLを取得できます。

1. `GET /api/room/status?room_url_key=...`
2. 得られた`room_id`で`GET /api/live/streaming_url?room_id=...&abr_available=1`
3. `streaming_url_list`の`type === "hls_all"`を選択

SHOWROOM APIのレスポンスには任意の外部`Origin`に対する`Access-Control-Allow-Origin`がありません。`callback=`や`jsonp=`もJSONPとして処理されず、JSONのまま返りました。したがってGitHub Pagesからの`fetch`はブラウザに遮断されます。

一方、実測した公開配信のHLS manifest/segment CDNは外部Origin向けCORSを返しました。Resolverが必要なのは短いJSON取得だけで、映像バイトを中継する必要はありません。

いずれも公式に公開・保証されたAPIではありません。

## WASMで完結できない理由

[WebAssembly公式の移植性説明](https://webassembly.org/docs/portability/)では、WASM自体はAPIやsyscallを規定せず、ブラウザではWeb Platform APIを通して機能へアクセスするとされています。また[公式Security文書](https://webassembly.org/docs/security/)は、ブラウザ内WASMが埋め込み環境のsame-origin policyに従うと明記しています。

つまりStreamlinkやyt-dlpをWASMへコンパイルしても、ネットワーク部分は結局`fetch`等を経由し、同じCORS判定を受けます。WASMが役立つのはmanifest解析やデコード処理であり、SHOWROOM APIのレスポンスを読み取る権限の獲得ではありません。

## ブラウザ外なら回避できる

Appleショートカットの「URLの内容を取得」はWebページJavaScriptではありません。[Apple公式ガイド](https://support.apple.com/en-ie/guide/shortcuts/apd58d46713f/ios)どおり端末のオートメーションからAPIを呼べるため、Pages側のCORS制約を受けずにJSONを取得できます。これが本リポジトリのサーバー不要経路です。
