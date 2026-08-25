# 履歴と通知の境界

## 現在の履歴

入力した`room_url_key`は、すぐ端末内へ保存します。Androidでは、ブックマークレットからPlayerへ渡された`room_id`を正規の識別子として統合します。PCは公式プレイヤーからroomIdを取得しないため、room keyで重複を除きます。

- 最大20件
- 最近開いた順
- サーバー送信なし
- 行の「×」で個別削除
- Android/通常ブラウザでは、URL keyが変わっても同じroomIdなら重複しない

iPhoneのホーム画面Web Appと通常Safariはstorageが分離されます。ShortcutがSafari Playerへ渡したroomIdをPWAへ戻すことはできないため、iOSのPWA履歴はroom keyで重複を除きます。これはサーバーを使わない現在の構成の制約です。

## 現在は通知しない

GitHub PagesのJavaScriptは、SHOWROOMのstatus APIをCORS越しに読めません。PWAを閉じればページJavaScriptも停止します。そのため、現在の構成には配信ポーリング、通知許可、Periodic Background Sync、Web Push登録を含めていません。

ホーム画面追加の案内は、履歴へすぐ戻るためのPWA導線として表示します。通知機能が有効になったという意味ではありません。

## なぜ端末だけで代替しないか

- Service WorkerとWASMもブラウザのsame-origin policyに従う。
- Periodic Background Syncは対応ブラウザが限られ、実行時刻も保証されない。
- Web Pushは受信側だけでは配信を検知できず、外部の送信処理が必要になる。
- GitHub Actionsのscheduled workflowは最短間隔と実行遅延があり、ライブ開始通知には向かない。

通知を追加するときの状態所有、無料枠、複数端末、再試行の条件は[サーバーフェーズ](server-phase.md)にまとめています。
