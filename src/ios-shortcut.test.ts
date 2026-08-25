import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IOS_SHORTCUT_NAME } from "./showroom";

const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");

describe("iPhone Shortcut distribution", () => {
  it("links the iPhone setup UI to a bundled signed Shortcut", () => {
    const shortcut = readFileSync(new URL("../public/SHOWROOM-PiP.shortcut", import.meta.url));

    expect(html).toContain('href="../SHOWROOM-PiP.shortcut" target="_blank" rel="noopener"');
    expect(shortcut.byteLength).toBeGreaterThan(10_000);
  });

  it("runs the same name that the downloaded filename installs", () => {
    const href = html.match(/href="\.\.\/([^\"]+\.shortcut)"/)?.[1];

    expect(href?.replace(/\.shortcut$/, "")).toBe(IOS_SHORTCUT_NAME);
  });
});
