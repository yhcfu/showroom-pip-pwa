import { describe, expect, it } from "vitest";
import { parseRoomHistory, upsertRoomHistory } from "./history";

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
});
