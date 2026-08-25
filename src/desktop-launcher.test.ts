import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");

describe("desktop launcher", () => {
  it("offers the dedicated player without desktop bookmarklet setup", () => {
    expect(html).toContain('id="open-room-button"');
    expect(html).toContain("プレイヤーで見る");
    expect(html).not.toContain('id="theater-room-button"');
    expect(html).not.toContain('id="desktop-tools"');
    expect(html).not.toContain('id="bookmarklet-link"');
  });

  it("keeps the Android bookmarklet installer", () => {
    expect(html).toContain('id="android-tools"');
    expect(html).toContain('id="copy-bookmarklet"');
  });
});
