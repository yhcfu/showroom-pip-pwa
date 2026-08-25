# iPhoneショートカットの作り方

このショートカットは、PWAから受け取った`room_url_key`を使ってSHOWROOM APIへ端末から直接アクセスし、取得したHLS URLをSafariプレイヤーへ渡します。GitHub Pages以外のサーバーは使いません。

## 事前準備

1. GitHub Pagesへデプロイする。
2. 公開した`/app/`をSafariで開き、共有 →「ホーム画面に追加」を押す。
3. iPhoneの「ショートカット」アプリで、新規ショートカットを作る。
4. 名前を正確に`SHOWROOM PiP`とする。

## アクション

次の順でアクションを追加します。`ショートカットの入力`はPWAから渡されるroom keyです。

1. `URL`に次を設定する。

   ```text
   https://www.showroom-live.com/api/room/status?room_url_key=[ショートカットの入力]
   ```

2. `URLの内容を取得`を追加し、方法を`GET`にする。
3. 取得した辞書から`is_live`を取り出し、falseなら「現在は配信中ではありません」と通知して停止する。
4. 同じ辞書から`room_id`と`room_name`を取り出す。
5. `URL`に次を設定する。

   ```text
   https://www.showroom-live.com/api/live/streaming_url?abr_available=1&room_id=[room_id]
   ```

6. `URLの内容を取得`を追加し、方法を`GET`にする。
7. `streaming_url_list`を繰り返し、`type`が`hls_all`の項目を選ぶ。なければ`hls`を選ぶ。
8. 選んだ項目の`url`を取り出す。
9. 次のURLを組み立てる。角括弧部分はそれぞれURLエンコードして差し込む。

   ```text
   https://yhcfu.github.io/showroom-pip-pwa/player/#v=1&status=ok&room=[room_url_key]&room_id=[room_id]&room_name=[room_name]&stream=[HLS URL]
   ```

10. `URLを開く`で上のURLを開く。

forkしてrepository名を変えた場合は、手順9のURLも実際のPlayer URLへ置き換えてください。

## 使い方

ホーム画面のPWAでルームを入力し、「このルームを開く」を押します。ショートカットがAPIを取得し、`/app/`のscope外にある`/player/`をSafariで開きます。動画を再生してからPiPボタンを押してください。

ホーム画面Web AppとSafariはstorageが分かれるため、Safari側で取得したroomIdとroom名はPWA履歴へ戻りません。PWAにはショートカットを起動する前に保存したroom keyが残り、同じkeyの履歴だけが重複排除されます。

iOSのバージョンによってscope外URLの開き方が変わる可能性があります。Playerがstandalone画面へ戻ってPiPできない場合は、SafariのアドレスバーへPlayer URLを貼り付けて開くのがフォールバックです。

参考: [WebKit bug 303885](https://bugs.webkit.org/show_bug.cgi?id=303885)
