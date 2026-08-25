# 履歴・配信検知・通知

## 履歴

入力した`room_url_key`は、その場で端末の`localStorage`へ保存します。Resolverまたは端末Bridgeから`room_id`を取得した後は、`room_id`を正規の識別子として同じルームを1件にまとめます。ルーム名やURL keyが変わっても、同じ`room_id`なら重複しません。

- 最大20件
- 最近開いた順
- サーバーへ履歴を保存しない
- 行の「×」で個別削除
- 配信中の行は赤い印と「再生」ボタンで表示

iPhoneショートカットから戻すURLにも`room_id`、`room_url_key`、`room_name`を含めると、Resolverを使わない場合も重複排除できます。

## PWAを開いている間の配信検知

「配信検知」をONにすると、履歴の最大20件を60秒ごとにまとめて確認します。Resolverの`/status?rooms=...`を1回呼び、Workerが各ルームのSHOWROOM status APIを取得します。

OFFからLIVEへ変わったときだけ通知します。同じ配信について、確認のたびに通知を繰り返すことはありません。

この機能にはResolver URLが必要です。ブラウザ内のService WorkerやWASMからSHOWROOM APIを直接呼んでも、CORS制約は変わりません。

## バックグラウンド

対応するAndroid Chromiumでは、通知許可後にPeriodic Background Syncを登録します。指定する最小間隔は15分ですが、実行時刻や実行頻度はブラウザが決めます。端末の省電力設定、利用頻度、ネットワーク状態によっては実行されません。

iPhoneはこの定期実行に依存できません。iOS/iPadOS 16.4以降のホーム画面Web AppはWeb Pushを受信できますが、外部からPushを送る監視処理が必要です。

## iPhoneで通知を許可する

1. SafariでPWAを開く。
2. サイト上部の「追加手順を見る」を押す。
3. Safariの共有ボタンから「ホーム画面に追加」を選ぶ。
4. ホーム画面にできたアイコンからPWAを開く。
5. 「通知を許可」を押す。

SafariのWebページから「ホーム画面に追加」を直接実行するAPIはありません。そのため、サイトでは端末が未追加のときだけ操作手順を表示します。

## 閉じたiPhoneへ通知する構成

付属WorkerにはWeb Pushの送信処理も含めています。D1・Cron Trigger・VAPID secretを設定すると、次の経路が有効になります。

```text
PWA ── watch list / PushSubscription ──→ Cloudflare Worker + D1
                                             │
Cloudflare Cron（1〜5分） ── SHOWROOM status ┤
                                             └── Web Push ──→ iPhone / Android
```

D1に保存するのは、Push subscription、監視するルーム、直前のLIVE状態だけです。HLS URLや再生時刻は保存しません。Cronは状態がOFFからLIVEへ変化したときだけWeb Pushを送ります。

初回確認ですでに配信中だった場合は通知しません。まず現在の状態を記録し、次回以降の変化を見ます。

購読登録は`WATCH_TOKEN`で保護します。同じTokenをCloudflare WorkerのsecretとPWAの設定欄へ入れてください。「配信検知」をOFFにすると、Workerへ空の監視一覧を送り、閉じた端末への通知も止めます。

2026年8月時点のCloudflare Free planはWorkers 100,000 request/日、Cron Trigger 5個、D1 5,000,000 rows read/日・100,000 rows written/日です。2分間隔、1端末、20ルームなら、Cronは720回/日です。SHOWROOM status取得は最大14,400回/日と見積もれます。Cloudflareの最新規約はdeploy時にも公式画面で確認してください。

参考:

- [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [MDN: Periodic Background Sync](https://developer.mozilla.org/docs/Web/API/Web_Periodic_Background_Synchronization_API)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
