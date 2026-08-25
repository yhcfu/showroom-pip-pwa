import { describe, expect, it } from "vitest";
import { buildShowroomRoomUrl, buildTheaterWindowFeatures, detectPlatform } from "./platform";

describe("platform routing", () => {
  it("detects iPhone and touch iPad user agents", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 })).toBe("ios");
    expect(detectPlatform({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios");
  });

  it("routes Android and desktop through SHOWROOM", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 16)", platform: "Linux armv8l", maxTouchPoints: 5 })).toBe("android");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 })).toBe("desktop");
    expect(buildShowroomRoomUrl("room-a")).toBe("https://www.showroom-live.com/r/room-a");
  });

  it("centers a reusable 16:9 theater window within the desktop", () => {
    expect(buildTheaterWindowFeatures({ availWidth: 1920, availHeight: 1080 })).toBe(
      "popup=yes,resizable=yes,scrollbars=yes,width=1280,height=816,left=320,top=132",
    );
    expect(buildTheaterWindowFeatures({ availWidth: 1024, availHeight: 768 })).toContain("width=942,height=626,left=41,top=71");
  });
});
