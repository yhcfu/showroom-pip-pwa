import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("iPhone Shortcut distribution", () => {
  it("links the iPhone setup UI to a bundled signed Shortcut", () => {
    const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
    const shortcut = readFileSync(new URL("../public/SHOWROOM-PiP.shortcut", import.meta.url));

    expect(html).toContain('href="../SHOWROOM-PiP.shortcut" target="_blank" rel="noopener"');
    expect(shortcut.byteLength).toBeGreaterThan(10_000);
  });
});
