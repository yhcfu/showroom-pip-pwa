import { describe, expect, it } from "vitest";
import { chooseStream, parseRoomKey } from "./index";

describe("worker input", () => {
  it("only accepts SHOWROOM room URLs", () => {
    expect(parseRoomKey("https://www.showroom-live.com/r/test_room")).toBe("test_room");
    expect(() => parseRoomKey("https://example.com/r/test_room")).toThrow("Only showroom-live.com");
  });
});

describe("chooseStream", () => {
  it("prefers the adaptive master playlist", () => {
    expect(chooseStream([
      { type: "hls", url: "https://cdn.example.test/low.m3u8" },
      { type: "hls_all", url: "https://cdn.example.test/master.m3u8" },
    ])).toBe("https://cdn.example.test/master.m3u8");
  });

  it("rejects non-HTTPS and non-HLS URLs", () => {
    expect(() => chooseStream([{ type: "hls_all", url: "http://example.test/master.m3u8" }])).toThrow();
  });
});
