import { describe, expect, it } from "vitest";
import { parseRoomHistory, setRoomPinned, upsertRoomHistory } from "./history";

describe("room history", () => {
  it("deduplicates renamed room keys by room id", () => {
    const initial = [{ roomKey: "old-key", roomId: 10, roomName: "Room", lastOpenedAt: 1 }];
    expect(upsertRoomHistory(initial, {
      roomKey: "new-key",
      roomId: 10,
      roomName: "Renamed",
      lastOpenedAt: 2,
    })).toEqual([{ roomKey: "new-key", roomId: 10, roomName: "Renamed", lastOpenedAt: 2 }]);
  });

  it("ignores malformed persisted data", () => {
    expect(parseRoomHistory("not-json")).toEqual([]);
    expect(parseRoomHistory('[{"roomKey":1}]')).toEqual([]);
  });

  it("drops fields left by the deferred polling prototype", () => {
    expect(parseRoomHistory(JSON.stringify([{
      roomKey: "room-a",
      roomId: 20,
      roomName: "A",
      lastOpenedAt: 100,
      isLive: true,
      lastCheckedAt: 200,
    }]))).toEqual([{
      roomKey: "room-a",
      roomId: 20,
      roomName: "A",
      lastOpenedAt: 100,
    }]);
  });

  it("keeps pinned rooms above recent rooms when reopened", () => {
    const pinned = { roomKey: "pinned", lastOpenedAt: 1, pinnedAt: 10 };
    expect(upsertRoomHistory([pinned], { roomKey: "recent", lastOpenedAt: 20 })).toEqual([
      pinned,
      { roomKey: "recent", lastOpenedAt: 20 },
    ]);
    expect(upsertRoomHistory([pinned], { roomKey: "pinned", lastOpenedAt: 30 })).toEqual([
      { roomKey: "pinned", lastOpenedAt: 30, pinnedAt: 10 },
    ]);
  });

  it("keeps pinned rooms outside the recent room limit", () => {
    const entries = [
      { roomKey: "pinned", lastOpenedAt: 1, pinnedAt: 10 },
      { roomKey: "old", lastOpenedAt: 2 },
    ];
    expect(upsertRoomHistory(entries, { roomKey: "new", lastOpenedAt: 3 }, 1)).toEqual([
      { roomKey: "pinned", lastOpenedAt: 1, pinnedAt: 10 },
      { roomKey: "new", lastOpenedAt: 3 },
    ]);
  });

  it("pins and unpins a room without changing its recent timestamp", () => {
    const entries = [
      { roomKey: "new", lastOpenedAt: 20 },
      { roomKey: "old", lastOpenedAt: 10 },
    ];
    const pinned = setRoomPinned(entries, entries[1], true, 30);
    expect(pinned).toEqual([
      { roomKey: "old", lastOpenedAt: 10, pinnedAt: 30 },
      { roomKey: "new", lastOpenedAt: 20 },
    ]);
    expect(setRoomPinned(pinned, pinned[0], false)).toEqual(entries);
  });

  it("preserves a valid persisted pin and drops only a malformed pin value", () => {
    expect(parseRoomHistory(JSON.stringify([
      { roomKey: "valid", lastOpenedAt: 1, pinnedAt: 2 },
      { roomKey: "invalid", lastOpenedAt: 3, pinnedAt: "now" },
    ]))).toEqual([
      { roomKey: "valid", lastOpenedAt: 1, pinnedAt: 2 },
      { roomKey: "invalid", lastOpenedAt: 3, pinnedAt: undefined },
    ]);
  });
});
