import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../player/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const player = readFileSync(new URL("./player.ts", import.meta.url), "utf8");

describe("player tools", () => {
  it("provides compact share, balance, screenshot, clip, PiP, and fullscreen controls", () => {
    expect(html).toContain('id="share-button"');
    expect(html).toContain('id="balance-button"');
    expect(html).toContain('id="balance-panel"');
    expect(html).toContain('id="screenshot-button"');
    expect(html).toContain('id="clip-button"');
    expect(html).toContain('id="clip-panel"');
    expect(html).toContain('id="clip-preview" class="clip-preview" aria-label="切り出し位置のプレビュー" controls playsinline');
    expect(html).toContain('id="clip-start"');
    expect(html).toContain('id="clip-end"');
    expect(html).toContain('id="clip-save"');
    expect(html).toContain("MP4切り出し（最大1分）");
    expect(html.indexOf('id="clip-timeline"')).toBeGreaterThan(html.indexOf('id="clip-save"'));
    expect(html).not.toContain('id="live-button"');
    expect(html).toContain('aria-keyshortcuts="S"');
    expect(html).not.toContain('class="tool-shortcut"');
    expect(html).toContain('id="pip-button"');
    expect(html).toContain('id="fullscreen-button"');
    expect(html).toContain('class="player-tool icon-tool"');
    expect(html).toContain('class="tool-icon default-icon"');
    expect(html).toContain('class="tool-icon success-icon"');
    expect(html).toContain('class="tool-label">L/R</span>');
    expect(html).toContain('id="screenshot-label" class="tool-label">撮影</span>');
    expect(html).toContain('id="pip-label" class="tool-label">PiP</span>');
    expect(html).toContain('id="fullscreen-label" class="tool-label">全画面</span>');
    expect(html.indexOf('id="screenshot-button"')).toBeLessThan(html.indexOf('id="share-button"'));
  });

  it("keeps icon actions named while hiding their labels on compact touch layouts", () => {
    expect(html).toContain('aria-label="共有URLをコピー"');
    expect(html).toContain('aria-label="左右の音声バランス"');
    expect(html).toContain('aria-label="スクリーンショットを保存・コピー"');
    expect(html).toContain('aria-label="映像をMP4に切り出す"');
    expect(html).toContain('aria-label="ピクチャーインピクチャー"');
    expect(html).toContain('aria-label="全画面"');
    expect(css).toContain(".player-tool[hidden] { display: none; }");
    expect(css).toContain(".icon-tool .tool-label { display: none; }");
  });

  it("reflects capture, PiP, and fullscreen state in the compact controls", () => {
    expect(player).toContain('screenshotButton.classList.add("is-success")');
    expect(player).not.toContain('screenshotLabel.textContent');
    expect(player).toContain('video.addEventListener("enterpictureinpicture"');
    expect(player).toContain('setFullscreenState(document.fullscreenElement !== null)');
    expect(css).toContain('.player-tool[aria-pressed="true"]');
  });

  it("keeps the clip panel visible while selecting or exporting a range", () => {
    expect(player).toContain("panelOpen: !balancePanel.hidden || !clipPanel.hidden");
    expect(player).toContain('clipPanel.setAttribute("aria-busy", "true")');
    expect(css).toContain(".clip-time-fields");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(player).toContain("clipPreview.controls = clipPreviewReady && !exportingClip && !refreshingClip");
    expect(player).toContain('clipPreview.addEventListener("play"');
    expect(player).toContain('clipPreview.addEventListener("playing", syncClipPreviewAudio)');
    expect(player).toContain("volumeDuringClipPreview(video.volume)");
  });

  it("opens one local TS file by drop without adding another toolbar action", () => {
    expect(html).toContain('id="local-ts-drop" class="local-ts-drop"');
    expect(html).not.toContain('id="local-ts-button"');
    expect(css).toContain(".local-ts-drop[hidden] { display: none; }");
    expect(player).toContain('stage.addEventListener("drop"');
    expect(player).toContain("void loadLocalTs(files[0])");
  });

  it("uses the rewind-preserving live HLS configuration", () => {
    expect(player).toContain("createPersistentFragmentLoader");
    expect(player).toContain("startPosition: restored.startPosition");
    expect(player).toContain('video.addEventListener("ended", () => {');
    expect(player).toContain("if (replaying) void startLivePlayback()");
    expect(player).not.toContain("liveButton");
    expect(player).not.toContain("video.currentTime >= video.duration");
    expect(player).toContain("lockHighestQuality(instance, Hls)");
    expect(player).toContain("instance.currentLevel = level");
  });

  it("reveals desktop tools from activity and hides them independently of hover", () => {
    expect(player).toContain('stage.addEventListener("pointermove"');
    expect(player).toContain('document.addEventListener("keydown"');
    expect(player).toContain('stage.classList.remove("keyboard-navigation")');
    expect(player).toContain('stage.classList.add("keyboard-navigation")');
    expect(css).toContain(".player-stage.playing.controls-idle .player-overlay");
    expect(css).toContain(".player-stage.playing.controls-idle.keyboard-navigation .player-overlay:focus-within");
    expect(css).not.toContain(".player-stage.playing:not(:hover):not(:focus-within)");
  });

  it("separates custom tools from native video controls on touch devices", () => {
    expect(html.indexOf('class="player-overlay"')).toBeLessThan(html.indexOf('class="player-frame"'));
    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".player-frame { position: relative; inset: auto; flex: 1 1 auto; }");
  });
});
