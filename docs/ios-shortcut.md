# iPhoneショートカット（サーバー不要）

この経路ではGitHub Pages以外のサーバーは不要です。PWAはApple公式の`shortcuts://run-shortcut` URL schemeで「SHOWROOM PiP」を起動します。URL schemeの仕様は[Apple公式ガイド](https://support.apple.com/en-au/guide/shortcuts/apd624386f42/ios)にあります。

## 前提

GitHub Pagesの公開URLを決めてから作成します。以下では次を例にします。

```text
https://YOUR_NAME.github.io/showroom-pip-pwa/
```

## ショートカットを作る

ショートカット名は正確に`SHOWROOM PiP`とします。

1. 「ショートカットの入力」をテキストとして受け取る。PWAがルームURLを`room_url_key`へ変換して渡す。
2. 「テキスト」で次を作る。末尾へショートカット入力を差し込む。
   `https://www.showroom-live.com/api/room/status?room_url_key=`
3. 「URL」→「URLの内容を取得」（GET）。
4. 結果の辞書から`is_live`を取得し、falseなら「配信中ではありません」と通知して停止。
5. 同じ辞書から`room_id`を取得。
6. 「テキスト」で次を作り、末尾へroom_idを差し込む。
   `https://www.showroom-live.com/api/live/streaming_url?abr_available=1&room_id=`
7. 「URL」→「URLの内容を取得」（GET）。
8. 辞書の`streaming_url_list`を「各項目を繰り返す」。各項目の`type`が`hls_all`なら、その項目の`url`を変数`HLS`へ設定して繰り返しを停止。
9. `HLS`へ「URLエンコード」を適用。
10. 「テキスト」で次を作り、末尾へエンコード済みHLSを差し込む。
    `https://YOUR_NAME.github.io/showroom-pip-pwa/#stream=`
11. 「URLを開く」でそのテキストを開く。

Appleは「URLの内容を取得」でGET API requestを作る手順を[公式に案内](https://support.apple.com/en-ie/guide/shortcuts/apd58d46713f/ios)しています。初回実行時はSHOWROOMへのアクセス許可を求められる場合があります。

通常の「URLを開く」でPWA側へ戻ってしまう端末では、手順10の先頭を`x-safari-https://YOUR_NAME.github.io/...`に変える手があります。これはSafariを明示的に開く未文書化schemeで、[海外フォーラムのiOS 17〜26での報告](https://stackoverflow.com/questions/60267796/ios-pwa-how-to-open-external-link-on-mobile-default-safarinot-in-app-browser/79794792)に基づく最終手段です。Appleの公式仕様ではなく、将来動かなくなる可能性があります。

## 使い方

1. ホーム画面からPWAを起動。
2. ルームURLまたは`room_url_key`を入力。
3. 「iPhoneショートカットで開く」をタップ。
4. ショートカットが通常Safariで静的プレイヤーを開く。
5. 再生開始後、動画コントロールまたはページのPiPボタンを押す。

## なぜSafariへ戻すのか

iOS/iPadOSでは、ホーム画面からstandalone表示したWeb AppのPiPが失敗する[WebKit Bug 303885](https://bugs.webkit.org/show_bug.cgi?id=303885)が2026-08-25時点でも未解決です。HLS、MP4、MSE、WASMの違いではなく表示コンテキスト側の問題なので、通常Safariへ開く必要があります。
