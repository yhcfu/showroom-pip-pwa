import { describe, expect, it } from "vitest";
import { LIVE_HLS_CONFIG } from "./live-playback";

describe("live HLS playback", () => {
  it("retains played media and does not force delayed playback to the live edge", () => {
    expect(LIVE_HLS_CONFIG.backBufferLength).toBe(Number.POSITIVE_INFINITY);
    expect(LIVE_HLS_CONFIG.liveSyncDurationCount).toBe(3);
    expect(LIVE_HLS_CONFIG.liveMaxLatencyDurationCount).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps low-latency startup enabled", () => {
    expect(LIVE_HLS_CONFIG.lowLatencyMode).toBe(true);
  });
});
