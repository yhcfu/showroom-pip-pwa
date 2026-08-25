# 後続のサーバーフェーズ

配信開始の自動検知と、閉じたiPhone/Androidへの通知には状態を持つ外部処理が必要です。現在の構成にあるVercel Resolverは要求時にHLS URLを返すだけで、定期処理や永続化はしません。ここで説明する通知基盤は後続フェーズです。

## 導入条件

サーバーフェーズを開始するときは、次を同時に満たす設計にします。

1. Worker/D1だけがバックグラウンドのOFF→LIVE状態を所有する。ページとService Workerで同じ遷移を判定しない。
2. 監視ルームは端末横断で重複排除し、1回のCronで各ルームを一度だけ確認する。
3. iOS通知の着地先は動画をstandalone PWAで再生せず、room付きShortcut CTAを表示する。
4. 監視設定は直列化し、revisionを付ける。古いON更新がOFFや削除を上書きしない。
5. 登録時に現在状態を初期化し、登録から最初のCronまでの開始を取りこぼさない。
6. Push deliveryは一意なtransition IDを持つoutboxへ保存し、状態確定後に送る。429と5xxはbackoffし、404/410は購読を削除する。
7. Free planの外部subrequest上限内で、status確認とPush送信をbudget管理する。
8. Resolver/status APIはtokenで保護する。CORSだけを認証として扱わない。
9. VAPID keyまたはResolver変更時は、旧登録削除、unsubscribe、再subscribeを順番に行う。

## 想定データモデル

```text
room_states       room_key / is_live / generation / checked_at
subscriptions     device / endpoint / config_revision / player_url
subscription_rooms
push_deliveries   subscription + room + generation / retry state
```

`room_states`を全端末の正規状態にします。`push_deliveries`は`subscription + room + generation`を一意にし、Cron重複やD1更新失敗による二重通知を防ぎます。

## 完了条件

- D1登録→Cron→Web Push→notification clickの統合テストがある。
- iPhoneとAndroid実機で、PWAを閉じた状態から通知を受け取れる。
- iPhoneは通知からShortcut、Safari player、PiPまで到達できる。
- Androidは通知からplayer、PiPまで到達できる。
- 監視OFFと履歴削除がサーバーで確認でき、通信失敗時はUIが反映待ちを表示する。
- 複数端末・20ルームでもCloudflare Freeのsubrequest budgetを超えない。
