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
  });

  it("separates custom tools from native video controls on touch devices", () => {
    expect(html.indexOf('class="player-overlay"')).toBeLessThan(html.indexOf('class="player-frame"'));
    expect(css).toContain("@media (hover: none) and (pointer: coarse)");
    expect(css).toContain(".player-frame { position: relative; inset: auto; flex: 1 1 auto; }");
  });
});
