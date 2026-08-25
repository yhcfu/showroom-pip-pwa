export function buildBookmarklet(playerBase: string): string {
  const target = new URL(playerBase);
  if (target.protocol !== "https:" && target.hostname !== "localhost") {
    throw new Error("プレイヤーURLはHTTPSで公開してください。");
  }
  target.search = "";
  target.hash = "";

  const code = `(async()=>{const P=${JSON.stringify(target.toString())},m=location.pathname.match(/^\\/r\\/([A-Za-z0-9_-]+)/);if(!/^(www\\.)?showroom-live\\.com$/.test(location.hostname)||!m){alert('SHOWROOMのルームページで実行してください');return}const k=m[1],t=open('about:blank','_blank');try{const s=await fetch('/api/room/status?room_url_key='+encodeURIComponent(k)).then(r=>{if(!r.ok)throw new Error('ルーム情報を取得できません');return r.json()});if(!s.is_live)throw new Error('現在は配信中ではありません');const j=await fetch('/api/live/streaming_url?abr_available=1&room_id='+encodeURIComponent(s.room_id)).then(r=>{if(!r.ok)throw new Error('配信URLを取得できません');return r.json()});const h=j.streaming_url_list.find(x=>x.type==='hls_all')||j.streaming_url_list.find(x=>x.type==='hls');if(!h)throw new Error('公開HLSがありません');const f=new URLSearchParams({v:'1',status:'ok',room:k,room_id:String(s.room_id),room_name:s.room_name||'',stream:h.url}),u=P+'#'+f;if(t)t.location=u;else location.href=u}catch(e){if(t)t.close();alert(e instanceof Error?e.message:'取得に失敗しました')}})()`;
  return `javascript:${code}`;
}
