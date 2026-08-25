import { describe, expect, it, vi } from "vitest";
import { resolveShowroomRoom } from "../api/resolve";

describe("resolveShowroomRoom", () => {
  it("resolves the preferred adaptive HLS stream", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ is_live: true, room_id: 42, room_name: "Room A" }))
      .mockResolvedValueOnce(Response.json({ streaming_url_list: [
        { type: "hls", url: "https://cdn.example.test/live/fallback.m3u8" },
        { type: "hls_all", url: "https://cdn.example.test/live/master.m3u8?token=short-lived" },
      ] }));

    await expect(resolveShowroomRoom("room-a", fetcher)).resolves.toEqual({
      roomKey: "room-a",
      roomId: 42,
      roomName: "Room A",
      streamUrl: "https://cdn.example.test/live/master.m3u8?token=short-lived",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0][0])).toContain("room/status?room_url_key=room-a");
    expect(String(fetcher.mock.calls[1][0])).toContain("streaming_url?abr_available=1&room_id=42");
  });

  it("stops before requesting a stream when the room is offline", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ is_live: false }));
    await expect(resolveShowroomRoom("room-a", fetcher)).rejects.toMatchObject({
      status: 409,
      code: "not_live",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-HLS upstream URL", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ is_live: true, room_id: 42 }))
      .mockResolvedValueOnce(Response.json({ streaming_url_list: [
        { type: "hls_all", url: "https://cdn.example.test/live/video.mp4" },
      ] }));
    await expect(resolveShowroomRoom("room-a", fetcher)).rejects.toMatchObject({
      code: "invalid_stream_url",
    });
  });
});
