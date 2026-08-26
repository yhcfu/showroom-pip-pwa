import { describe, expect, it } from "vitest";
import { highestQualityLevel, LIVE_HLS_CONFIG } from "./live-playback";

describe("live HLS playback", () => {
  it("retains played media and does not force delayed playback to the live edge", () => {
    expect(LIVE_HLS_CONFIG.backBufferLength).toBe(Number.POSITIVE_INFINITY);
    expect(LIVE_HLS_CONFIG.liveSyncDurationCount).toBe(3);
    expect(LIVE_HLS_CONFIG.liveMaxLatencyDurationCount).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps low-latency startup enabled", () => {
    expect(LIVE_HLS_CONFIG.lowLatencyMode).toBe(true);
  });

  it("selects the highest resolution and bitrate", () => {
    expect(highestQualityLevel([
      { width: 640, height: 360, bitrate: 800_000 },
      { width: 1280, height: 720, bitrate: 2_000_000 },
      { width: 1280, height: 720, bitrate: 2_500_000 },
    ])).toBe(2);
    expect(highestQualityLevel([])).toBe(-1);
  });
});
