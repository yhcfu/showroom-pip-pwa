import { describe, expect, it } from "vitest";
import { mergeRoomStatus, parseRoomHistory, upsertRoomHistory } from "./history";

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

  it("merges polling state without changing recency", () => {
    const initial = [{ roomKey: "room-a", lastOpenedAt: 100 }];
    expect(mergeRoomStatus(initial, {
      roomKey: "room-a",
      roomId: 20,
      roomName: "A",
      isLive: true,
      lastCheckedAt: 200,
    })).toEqual([{
      roomKey: "room-a",
      roomId: 20,
      roomName: "A",
      isLive: true,
      lastOpenedAt: 100,
      lastCheckedAt: 200,
    }]);
  });

  it("ignores malformed persisted data", () => {
    expect(parseRoomHistory("not-json")).toEqual([]);
    expect(parseRoomHistory('[{"roomKey":1}]')).toEqual([]);
  });
});
