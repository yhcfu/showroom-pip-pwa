import { describe, expect, it } from "vitest";
import { buildBookmarklet } from "./bookmarklet";

describe("buildBookmarklet", () => {
  it("embeds the HTTPS player and SHOWROOM same-origin endpoints", () => {
    const result = buildBookmarklet("https://example.github.io/repo/player/#old");
    expect(result).toMatch(/^javascript:/);
    expect(result).toContain('https://example.github.io/repo/player/');
    expect(result).not.toContain("#old");
    expect(result).toContain("/api/room/status");
    expect(result).toContain("/api/live/streaming_url");
    expect(result).toContain("showroom-live");
    expect(result).toContain("else location.href=u");
  });

  it("rejects a non-local HTTP player", () => {
    expect(() => buildBookmarklet("http://example.com/player/")).toThrow("HTTPS");
  });
});
