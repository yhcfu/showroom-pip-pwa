import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../player/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
const player = readFileSync(new URL("./player.ts", import.meta.url), "utf8");

describe("player tools", () => {
  it("provides compact share, balance, screenshot, PiP, and fullscreen controls", () => {
    expect(html).toContain('id="share-button"');
    expect(html).toContain('id="balance-button"');
    expect(html).toContain('id="balance-panel"');
    expect(html).toContain('id="screenshot-button"');
    expect(html).toContain('aria-keyshortcuts="S"');
    expect(html).toContain('id="pip-button"');
    expect(html).toContain('id="fullscreen-button"');
    expect(html).toContain('class="player-tool icon-tool"');
    expect(html).toContain('class="tool-icon default-icon"');
    expect(html).toContain('class="tool-icon success-icon"');
    expect(html).toContain('class="tool-label">L/R</span>');
    expect(html).toContain('id="screenshot-label" class="tool-label">撮影</span>');
    expect(html).toContain('id="pip-label" class="tool-label">PiP</span>');
    expect(html).toContain('id="fullscreen-label" class="tool-label">全画面</span>');
  });

  it("keeps icon actions named while hiding their labels on compact touch layouts", () => {
    expect(html).toContain('aria-label="共有URLをコピー"');
    expect(html).toContain('aria-label="左右の音声バランス"');
    expect(html).toContain('aria-label="スクリーンショットを保存・コピー"');
    expect(html).toContain('aria-label="ピクチャーインピクチャー"');
    expect(html).toContain('aria-label="全画面"');
    expect(css).toContain(".player-tool[hidden] { display: none; }");
    expect(css).toContain(".icon-tool .tool-label, .icon-tool .tool-shortcut { display: none; }");
  });

  it("reflects capture, PiP, and fullscreen state in the compact controls", () => {
    expect(player).toContain('screenshotButton.classList.add("is-success")');
    expect(player).toContain('video.addEventListener("enterpictureinpicture"');
    expect(player).toContain('setFullscreenState(document.fullscreenElement !== null)');
    expect(css).toContain('.player-tool[aria-pressed="true"]');
  });

  it("uses the rewind-preserving live HLS configuration", () => {
    expect(player).toContain("new Hls(LIVE_HLS_CONFIG)");
  });

  it("reveals desktop tools from activity and hides them independently of hover", () => {
    expect(player).toContain('stage.addEventListener("pointermove"');
    expect(player).toContain('document.addEventListener("keydown"');
    expect(css).toContain(".player-stage.playing.controls-idle .player-overlay");
    expect(css).toContain(".player-overlay:focus-within");
    expect(css).not.toContain(".player-stage.playing:not(:hover):not(:focus-within)");
  });

  it("separates custom tools from native video controls on touch devices", () => {
    expect(html.indexOf('class="player-overlay"')).toBeLessThan(html.indexOf('class="player-frame"'));
    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".player-frame { position: relative; inset: auto; flex: 1 1 auto; }");
  });
});
