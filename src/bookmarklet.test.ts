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
    expect(result).toContain("location.href=P+'#'+f");
    expect(result).not.toContain("about:blank");
  });

  it("rejects a non-local HTTP player", () => {
    expect(() => buildBookmarklet("http://example.com/player/")).toThrow("HTTPS");
  });

  it("allows the loopback development server", () => {
    expect(buildBookmarklet("http://127.0.0.1:5173/player/")).toMatch(/^javascript:/);
  });
});
