# Android・PCのブックマークレット

AndroidとPCでは、SHOWROOMのルームページと同じoriginでJavaScriptを実行します。これにより、外部PWAからはCORSで読めないAPIを、SHOWROOMページ自身から取得できます。

## PCで初回だけ行うこと

1. Chromeのブックマークバーを表示する。非表示なら`Ctrl+Shift+B`（macOSは`Command+Shift+B`）を押す。
2. PWAに表示された「SHOWROOM PiP」ボタンを、ブックマークバーへドラッグする。

ドラッグできないブラウザでは「ドラッグできない場合はコピー」を押し、任意のブックマークのURL欄をコピーした`javascript:...`へ置き換えます。

## Androidで初回だけ行うこと

1. PWAの「ブックマークレットをコピー」を押す。
2. ブラウザで任意のページをブックマークする。
3. 作ったブックマークを編集し、URL欄をコピーした`javascript:...`へ置き換える。
4. 名前を`SHOWROOM PiP`など、検索しやすいものにする。

Chrome for Androidでは、ブックマーク一覧から押す代わりに、SHOWROOMのルームページを表示した状態でアドレスバーへブックマーク名を入力し、候補を選びます。

## 使い方

1. PWAへルームURLを入力するか、履歴の「開く」を押す。
2. 開いた`https://www.showroom-live.com/r/...`でブックマークレットを実行する。
3. 配信中なら、そのSHOWROOMタブがPlayerへ切り替わる。PCではPWAのタブは残る。
4. 動画を再生してPiPボタンを押す。

ブックマークレットはroom key、roomId、room名もPlayerへ渡します。PlayerとPWAは同じGitHub Pages originなので、次にPWAを開いたとき履歴がroomIdで重複排除されます。

## 制約

- ブックマーク同期サービスへコードが保存される場合があります。コードに秘密情報は含みません。
- SHOWROOM側のContent Security PolicyやAPI仕様が変わると動かなくなる可能性があります。
- 配信していないルームではPlayerを開きません。
- 限定・有料配信やログインCookieの転送には対応しません。
