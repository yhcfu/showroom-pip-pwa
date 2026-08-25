# iPhone Shortcutの追加

手動でアクションを組み立てる必要はありません。公開版には、内容をリポジトリで確認できる署名済みの`SHOWROOM PiP` Shortcutが付属します。

## 初回だけ行うこと

1. iPhoneのSafariまたはホーム画面版で[SHOWROOM PiP](https://yhcfu.github.io/showroom-pip-pwa/app/)を開く。
2. 「Shortcutを追加」を押す。
3. ダウンロード表示になった場合は、Safariのダウンロード一覧から`SHOWROOM-PiP.shortcut`を開く。
4. ショートカットアプリで内容を確認し、「ショートカットを追加」を押す。

追加後、ショートカットアプリの「すべてのショートカット」に`SHOWROOM PiP`が表示されます。名前は変更しないでください。

## 使い方

1. ホーム画面のSHOWROOM PiPを開く。
2. ルームURLを貼り、「Shortcutで開く」を押す。
3. 初回だけ、SHOWROOMへのネットワークアクセスを許可する。
4. Safari Playerで動画を再生し、PiPボタンを押す。

`shortcuts://run-shortcut`は保存済みShortcutの実行専用です。Shortcutを追加する前に「Shortcutで開く」を押しても、自動作成はされません。

## 内容と再生成

Shortcutは端末上でSHOWROOMのstatus APIとstreaming URL APIを呼び、公開HLS URLをSafari Playerへ渡します。映像やCookieを外部サーバーへ送りません。

- レビュー可能なソース: [`shortcut/SHOWROOM-PiP.cherri`](../shortcut/SHOWROOM-PiP.cherri)
- 署名済み配布ファイル: [`public/SHOWROOM-PiP.shortcut`](../public/SHOWROOM-PiP.shortcut)
- 再生成手順: [`shortcut/README.md`](../shortcut/README.md)

ホーム画面Web AppとSafariはstorageが分かれるため、Safari側で取得したroomIdとroom名はPWA履歴へ戻りません。PWA側ではShortcut起動前に保存したroom keyで履歴を重複排除します。

iOSのバージョンによってscope外URLの開き方が変わる可能性があります。Playerがstandalone画面へ戻ってPiPできない場合は、SafariのアドレスバーへPlayer URLを貼り付けて開くのがフォールバックです。

参考: [WebKit bug 303885](https://bugs.webkit.org/show_bug.cgi?id=303885)
