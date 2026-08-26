# 制約・利用上の注意

## 技術的制約

- SHOWROOMのiframeは`X-Frame-Options: DENY`で拒否される。
- SHOWROOM JSON APIは外部origin向けCORSを返さない。
- iOSのstandalone PWAではPiPが失敗する既知問題があるため、scope外のSafari playerを使う。
- iPhoneのホーム画面Web AppとSafariはstorageが分かれるため、iOSのPWA履歴はroomIdではなくroom keyで重複排除する。
- すべての端末でVercel Resolverへ接続できるときだけ配信URLを取得できる。Resolver停止時や無料枠超過時は再生できない。
- PCではウィンドウ追従表示とFullscreen APIによる全画面を主な表示方法とする。ブラウザが対応する場合はPiPボタンも利用できる。
- L/Rバランスはfine pointerを持ち、HLS.jsとWeb Audio APIを使えるPC Chrome/Edgeだけに表示する。これらのブラウザではOSのnative HLSよりHLS.jsを優先する。スマートフォンは対象外。Safariは`MediaElementAudioSourceNode`へ接続すると無音になる既知のWebKit問題があるため対象外。
- L/Rバランスはページ内のPlayer音声だけを変更する。OSや他タブの音声には影響しない。
- 現在のResolverは要求時のURL解決だけを行うため、配信開始の自動検知と通知はできない。
- 配信終了、room key誤り、限定・有料配信、地域制限には対応しない。
- 非公開APIのfield名やendpointが変われば修正が必要になる。
- HLSだけの視聴がSHOWROOM上の視聴者数へ反映されるかは未確認。
- SHOWROOMのコメント、ギフト、イベント情報など、映像以外のUIは表示しない。

## 利用上の境界

[SHOWROOM利用規約](https://www.showroom-live.com/s/terms)は、サービス上のコンテンツ利用や複製・公衆送信を制限しています。本実装は個人端末で公開ライブを直接視聴する実験用であり、公式に許可された外部プレイヤーAPIではありません。

次の用途には使わないでください。

- HLS URLを第三者へ配布する
- 映像を録画、保存、再配信する
- 限定・有料配信の制限を回避する
- SHOWROOMのCookieやsessionを外部へ送る

公開repositoryにもHLS URLや利用者情報をcommitしないでください。SHOWROOMの最新規約と配信者の権利を優先してください。
