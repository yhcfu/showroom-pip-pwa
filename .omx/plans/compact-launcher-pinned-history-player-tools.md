# コンパクトUI・ピン固定・プレイヤーツール 実装計画

## Requirements Summary

- 玄人向けの個人用ツールとして、ランチャーから重複する説明、段階表示、補足ラベルを取り除く。
- 初見でも「ルームを入力して開く」「履歴から開く」「必要なら設定を見る」は判断できる状態を保つ。
- 履歴のルームをピン固定できるようにし、固定済みルームは最近開いた時刻に左右されず上部に残す。
- プレイヤーに、共有用の正規URLをコピーする操作を追加する。HLS URLや一時的なストリーム情報は共有しない。
- Chromium系のHLS.js再生経路だけ、Web Audio APIを使ったL/Rバランス調整を提供する。
- Safari/iPhoneのネイティブHLSでは、既知のWebKit制約によりL/R操作を表示しない。
- 新しいランタイム依存やサーバー処理は追加しない。

## Acceptance Criteria

1. `/app/` の主要表示はタイトル、ルーム入力、`開く`、履歴、折りたたまれた設定だけで構成される。
2. 入力欄とアイコン操作には、画面上の冗長な説明に頼らないアクセシブルな名前がある。
3. 履歴行からピンの追加・解除ができ、再読み込み後も維持される。
4. ピン済み履歴は未ピンの履歴より上に並び、通常履歴20件の上限から除外される。
5. 既存の `showroom-pip-history-v1` データはそのまま読み込める。
6. ルームから開いたプレイヤーでは、`/player/?room=<roomKey>` 形式の共有URLをコピーできる。
7. HLS URLを直接開いたプレイヤーでは、共有ボタンを表示しない。
8. HLS.js再生経路ではL/Rスライダーが表示され、値を端末内に保存し、次回も復元する。
9. ネイティブHLS再生経路ではL/R UIを表示せず、Web Audioグラフを作成しない。
10. 読み込み成功後の常駐ステータスは消え、読み込み中とエラーだけが表示される。
11. 単体テスト、TypeScript、Vite build、差分検査が通る。

## Implementation Steps

1. `DESIGN.md:28`
   - expert-firstの情報階層、ピン固定、共有URL、条件付きL/R UIをプロダクト契約として記録する。
   - SafariでL/Rを出さない互換性境界と物理端末の検証課題を明記する。

2. `src/history.ts:1` / `src/history.test.ts:1`
   - `RoomHistoryEntry` に任意の `pinnedAt` を追加する。
   - 並び順と上限処理を1か所に集約し、ピン済みと通常履歴を分離して正規化する。
   - ピンの切り替え関数を追加し、重複排除、旧データ互換、上限除外をテストする。

3. `app/index.html:14` / `src/main.ts:78` / `src/style.css:10`
   - 説明文、ステップ番号、重複見出し、フッターを削り、主要操作を短くする。
   - インストール案内とHLS直接入力を折りたたみ設定へ移す。
   - 履歴行へピン、再生、削除のコンパクトな操作を追加する。
   - 通常成功メッセージを常駐させず、入力・エラーだけで状態を伝える。

4. `player/index.html:18` / `src/player.ts:40` / `src/audio-balance.ts:1`
   - `URL` コピー、`L/R`、PiP、全画面を同じコンパクトなツール列にする。
   - 共有URLは `buildRoomPlayerUrl` から生成し、ストリームfragmentを含めない。
   - HLS.js経路で初めてL/Rを操作した時だけ `AudioContext`、`MediaElementAudioSourceNode`、`StereoPannerNode` を作る。
   - バランス値のclamp、保存値のparse、短い表示ラベルを純粋関数にして単体テストする。
   - ネイティブHLS経路ではL/R UIを隠す。

5. Tests and documentation (`src/desktop-launcher.test.ts:1`, `src/player-ui.test.ts:1`, `README.md:7`)
   - `src/desktop-launcher.test.ts` を新しい最小UI契約に合わせる。
   - プレイヤーの静的UI契約と音声バランスの純粋関数テストを追加する。
   - `README.md`、`docs/architecture.md`、`docs/history-and-notifications.md`、`docs/limitations.md`、`docs/research.md` を現状に合わせる。

6. Verification
   - `npm run check`
   - `git diff --check`
   - `typos`、`actionlint`（利用可能な場合）
   - ローカルブラウザでランチャー、ピン永続化、共有URL、HLS.jsのL/R UI、レスポンシブ表示を確認する。
   - 公開前に差分と検証結果を提示し、承認後にcommit/pushしてGitHub Pagesを再確認する。

## Execution Status

- [x] Design contract refreshed
- [x] Pinned history implemented and unit-tested
- [x] Launcher compacted and browser-checked
- [x] Clean share URL implemented and browser-checked
- [x] Conditional L/R balance implemented and unit-tested
- [x] Documentation synchronized
- [x] Local test, build, typo, workflow, audit, and diff checks passed
- [ ] Physical Android/Windows audio verification
- [ ] Commit, push, and public GitHub Pages verification

## Risks and Mitigations

- `MediaElementAudioSourceNode` のCORS制約で無音になる可能性
  - SHOWROOM CDNのCORSヘッダーを前提とし、HLS.js経路だけで有効化する。初期化失敗は再生を壊さずL/R機能だけ無効化する。
- SafariのネイティブHLSをWeb Audioへ接続すると無音になる既知問題
  - `video.canPlayType("application/vnd.apple.mpegurl")` の経路ではL/Rを表示も初期化もしない。
- ピン済み履歴が無制限に増える
  - ユーザーが明示的に固定した項目だけ上限外とし、削除と解除を常に提供する。
- Clipboard APIが拒否される
  - コピー失敗を短いエラーとして表示し、プレイヤー再生は継続する。
- 画面幅が狭い端末で操作が詰まる
  - 文字列を短縮し、ツール列を折り返さず、ステータスを別行に逃がす。

## Proof Gaps Requiring Physical Devices

- iPhone Safari/PWAでネイティブHLS、PiP、L/R非表示が期待どおりか。
- Android ChromeでHLS.js、PiP、L/R調整を併用して音声が継続するか。
- Windows Chrome/EdgeでL/R調整と全画面が安定するか。
