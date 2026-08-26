# 履歴と通知の境界

## 現在の履歴

入力した`room_url_key`は、すぐ端末内へ保存します。その後、全端末でResolverからPlayerへ渡された`room_id`を正規の識別子として統合します。

- 通常履歴は最大20件、最近開いた順
- ピン固定したルームは通常履歴の上限外で上部に表示
- ピン内は最後に固定した順
- サーバー送信なし
- 行のピンで固定・解除、「×」で個別削除
- PlayerとPWAがstorageを共有する環境では、URL keyが変わっても同じroomIdなら重複しない

iPhoneのホーム画面Web Appと通常Safariでstorageが分離される環境では、PWA側の履歴とピン状態はそのstorage内に保存され、room keyで重複を除きます。視聴経路は変わりません。

## 現在は通知しない

Resolverは画面から要求されたときだけSHOWROOMのstatus APIを読みます。定期実行はありません。PWAを閉じればページJavaScriptも止まるため、現在の構成には配信ポーリング、通知許可、Periodic Background Sync、Web Push登録を含めていません。

ホーム画面追加の案内は、履歴へすぐ戻るためのPWA導線として表示します。通知機能が有効になったという意味ではありません。

## なぜ端末だけで代替しないか

- Service WorkerとWASMもブラウザのsame-origin policyに従う。
- Periodic Background Syncは対応ブラウザが限られ、実行時刻も保証されない。
- Web Pushは受信側だけでは配信を検知できず、外部の送信処理が必要になる。
- GitHub Actionsのscheduled workflowは最短間隔と実行遅延があり、ライブ開始通知には向かない。

通知を追加するときの状態所有、無料枠、複数端末、再試行の条件は[サーバーフェーズ](server-phase.md)にまとめています。
