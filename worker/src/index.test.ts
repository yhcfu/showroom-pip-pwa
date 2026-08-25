import { describe, expect, it } from "vitest";
import resolver, { chooseStream, parseRoomKey } from "./index";

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

describe("status endpoint", () => {
  it("rejects more than twenty rooms before calling SHOWROOM", async () => {
    const rooms = Array.from({ length: 21 }, (_, index) => `room-${index}`).join(",");
    const response = await resolver.fetch(
      new Request(`https://resolver.test/status?rooms=${rooms}`),
      { ALLOWED_ORIGINS: "https://app.test" },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "too_many_rooms" });
  });
});

describe("push endpoints", () => {
  it("does not expose a public key until Web Push is configured", async () => {
    const response = await resolver.fetch(
      new Request("https://resolver.test/push/public-key"),
      { ALLOWED_ORIGINS: "https://app.test" },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(503);
  });

  it("returns the configured VAPID public key", async () => {
    const response = await resolver.fetch(
      new Request("https://resolver.test/push/public-key"),
      { ALLOWED_ORIGINS: "https://app.test", VAPID_PUBLIC_KEY: "public-key" },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ publicKey: "public-key" });
  });

  it("rejects unauthenticated subscription writes before touching D1", async () => {
    const response = await resolver.fetch(
      new Request("https://resolver.test/push/subscription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      { ALLOWED_ORIGINS: "https://app.test", WATCH_TOKEN: "secret" },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(401);
  });
});
