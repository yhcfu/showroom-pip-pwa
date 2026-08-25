import { describe, expect, it } from "vitest";
import {
  buildPlayerUrl,
  buildRoomPlayerUrl,
  buildShortcutUrl,
  parseRoomKey,
  readPlayerHandoff,
  readRoomKeyFromPlayerUrl,
  readStreamFromHash,
} from "./showroom";

describe("parseRoomKey", () => {
  it("accepts a room key", () => expect(parseRoomKey("room_123-A")).toBe("room_123-A"));
  it("extracts a key from a room URL", () => {
    expect(parseRoomKey("https://www.showroom-live.com/r/example_room?foo=1")).toBe("example_room");
  });
  it("rejects another host", () => {
    expect(() => parseRoomKey("https://example.com/r/example_room")).toThrow("showroom-live.com");
  });
});

describe("handoff URLs", () => {
  const stream = "https://cdn.example.test/live/master.m3u8?token=a&b=2";

  it("keeps the HLS URL in the fragment", () => {
    const result = buildPlayerUrl(stream, "https://user.github.io/showroom-pip/player/?old=1", {
      roomKey: "room-a",
      roomId: 42,
      roomName: "Room A",
    });
    expect(result).not.toContain("?old=1");
    expect(new URL(result).pathname).toBe("/showroom-pip/player/");
    expect(readStreamFromHash(new URL(result).hash)).toBe(stream);
    expect(readPlayerHandoff(new URL(result).hash)).toEqual({
      streamUrl: stream,
      roomKey: "room-a",
      roomId: 42,
      roomName: "Room A",
    });
  });

  it("creates an Apple Shortcuts URL", () => {
    expect(buildShortcutUrl("room key")).toContain("shortcuts://run-shortcut?");
    expect(buildShortcutUrl("room key")).toContain("name=SHOWROOM-PiP");
  });

  it("builds a player URL that resolves a room without exposing an HLS URL", () => {
    const result = buildRoomPlayerUrl("room-a", "https://user.github.io/showroom-pip/player/#old");
    expect(result).toBe("https://user.github.io/showroom-pip/player/?room=room-a");
    expect(readRoomKeyFromPlayerUrl(result)).toBe("room-a");
  });
});
