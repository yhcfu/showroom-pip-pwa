# 制約・利用上の注意

## 技術的制約

- SHOWROOM iframe: `X-Frame-Options: DENY`のため不可。
- iOS standalone PWA PiP: WebKit Bug 303885が未解決。通常Safariへhandoffする。
- Android/iOSの画面キャプチャ: `getDisplayMedia()`はモバイルブラウザで使える前提にできないため、この方式には含めない。
- 配信終了、room key誤り、限定/有料配信、地域制限には非対応。
- 非公開APIのため、field名やendpoint変更時は修正が必要。
- HLSだけの視聴がSHOWROOM上の視聴者数へ反映されるかは未確認。
- PWAを閉じた後のJavaScript常駐はできない。Periodic Background Syncの有無と実行頻度はブラウザが決める。
- iPhoneでWeb通知を許可できるのは、iOS/iPadOS 16.4以降でホーム画面に追加したWeb App。閉じた状態への通知にはWeb Push送信側が必要。

## 利用上の境界

[SHOWROOM利用規約](https://www.showroom-live.com/s/terms)は、サービス上のコンテンツ利用や複製・公衆送信を制限しています。本実装は個人端末で公開ライブを直接視聴する実験を想定しますが、公式に許可された外部プレイヤーAPIではありません。

次は行わないでください。

- HLS URLを第三者へ配布する
- 映像を録画・保存・再配信する
- 限定/有料配信の制限を回避する
- 自分や他人のSHOWROOM CookieをWorkerへ送る
- Resolverを無制限の公開proxyへ拡張する

公開リポジトリへする場合も、HLS URLや利用者情報をcommitしないでください。自己責任で、SHOWROOMの最新規約と配信者の権利を優先してください。
