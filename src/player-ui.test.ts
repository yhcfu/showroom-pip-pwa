import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../player/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

describe("player tools", () => {
  it("provides compact share, balance, PiP, and fullscreen controls", () => {
    expect(html).toContain('id="share-button"');
    expect(html).toContain('id="balance-button"');
    expect(html).toContain('id="balance-panel"');
    expect(html).toContain('id="pip-button"');
    expect(html).toContain('id="fullscreen-button"');
    expect(html).toContain('class="player-tool icon-tool"');
    expect(html).toContain('class="tool-icon default-icon"');
    expect(html).toContain('class="tool-icon success-icon"');
    expect(html).toContain('class="tool-label">L/R</span>');
    expect(html).toContain('class="tool-label">PiP</span>');
  });

  it("keeps icon actions named while hiding their labels on compact touch layouts", () => {
    expect(html).toContain('aria-label="共有URLをコピー"');
    expect(html).toContain('aria-label="左右の音声バランス"');
    expect(html).toContain('aria-label="ピクチャーインピクチャー"');
    expect(css).toContain(".player-tool[hidden] { display: none; }");
    expect(css).toContain(".icon-tool .tool-label { display: none; }");
  });

  it("separates custom tools from native video controls on touch devices", () => {
    expect(html.indexOf('class="player-overlay"')).toBeLessThan(html.indexOf('class="player-frame"'));
    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".player-frame { position: relative; inset: auto; flex: 1 1 auto; }");
  });
});
