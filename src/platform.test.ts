import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform";

describe("platform routing", () => {
  it("detects iPhone and touch iPad user agents", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 })).toBe("ios");
    expect(detectPlatform({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios");
  });

  it("detects Android and desktop for optional installation guidance", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 16)", platform: "Linux armv8l", maxTouchPoints: 5 })).toBe("android");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 })).toBe("desktop");
  });
});
