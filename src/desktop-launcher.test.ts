import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");

describe("shared launcher", () => {
  it("offers one dedicated player flow on every platform", () => {
    expect(html).toContain('id="open-room-button"');
    expect(html).toContain(">開く</button>");
    expect(html).toContain(">設定</summary>");
    expect(html).not.toContain("PERSONAL VIEWER LAUNCHER");
    expect(html).not.toContain("全端末で同じ動画専用プレイヤー");
    expect(html).not.toContain('id="theater-room-button"');
    expect(html).not.toContain("Shortcut");
    expect(html).not.toContain("ブックマークレット");
    expect(html).not.toContain('id="android-tools"');
    expect(html).not.toContain('id="ios-tools"');
  });
});
