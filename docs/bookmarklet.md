# ブックマークレット（サーバー不要）

SHOWROOMのルームページ自身でJavaScriptを実行すれば、APIと同一originになるためCORSに遮られません。その場でHLS URLを取得し、GitHub Pagesのプレイヤーを別タブで開けます。

## 作成

Safari/Chromeで任意ページをブックマークし、URL欄を次のコードへ置き換えます。`PLAYER_BASE`だけ自分のPages URLへ変更してください。

```javascript
javascript:(async()=>{const PLAYER_BASE='https://YOUR_NAME.github.io/showroom-pip-pwa/';const m=location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)/);if(!m){alert('SHOWROOMの /r/<room_url_key> ページで実行してください');return}const tab=open('about:blank','_blank');try{const s=await fetch('/api/room/status?room_url_key='+encodeURIComponent(m[1])).then(r=>r.json());if(!s.is_live)throw new Error('配信中ではありません');const j=await fetch('/api/live/streaming_url?abr_available=1&room_id='+s.room_id).then(r=>r.json());const h=j.streaming_url_list.find(x=>x.type==='hls_all')||j.streaming_url_list.find(x=>x.type==='hls');if(!h)throw new Error('HLSがありません');tab.location=PLAYER_BASE+'#'+new URLSearchParams({stream:h.url})}catch(e){tab.close();alert(e.message)}})()
```

## 使い方

1. 通常のSafari/Chromeで`https://www.showroom-live.com/r/<room_url_key>`を開く。
2. 作成したブックマークレットを実行。
3. 開いたPagesプレイヤーで再生し、PiPを開始。

## 制約

- ブラウザがブックマークレット実行を許す必要があります。iOS Safariではブックマーク編集が必要です。
- SHOWROOMのContent Security PolicyやAPI/URL変更で動かなくなる可能性があります。
- SHOWROOMページをiframe化する方法ではありません。
- PWAから別originのSHOWROOMページへコードを注入することはできません。
