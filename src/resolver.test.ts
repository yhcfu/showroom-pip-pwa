import { describe, expect, it, vi } from "vitest";
import { resolveRoom } from "./resolver";

describe("resolveRoom", () => {
  it("returns a validated player handoff", async () => {
    const fetcher = vi.fn(async () => Response.json({
      roomKey: "room-a",
      roomId: 42,
      roomName: "Room A",
      streamUrl: "https://cdn.example.test/live/master.m3u8?token=short-lived",
    }));

    await expect(resolveRoom("room-a", "https://resolver.example.test", fetcher)).resolves.toEqual({
      roomKey: "room-a",
      roomId: 42,
      roomName: "Room A",
      streamUrl: "https://cdn.example.test/live/master.m3u8?token=short-lived",
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://resolver.example.test/api/resolve?room=room-a"),
      { headers: { accept: "application/json" } },
    );
  });

  it("accepts an explicit resolver endpoint", async () => {
    const fetcher = vi.fn(async () => Response.json({
      roomKey: "room-a",
      roomId: 42,
      streamUrl: "https://cdn.example.test/live/master.m3u8",
    }));

    await resolveRoom("room-a", "https://resolver.example.test/custom/resolve", fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://resolver.example.test/custom/resolve?room=room-a"),
      { headers: { accept: "application/json" } },
    );
  });

  it("turns a not-live response into a useful message", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: "not_live" }, { status: 409 }));
    await expect(resolveRoom("room-a", "https://resolver.example.test/api/resolve", fetcher)).rejects.toThrow(
      "現在は配信中ではありません",
    );
  });
});
