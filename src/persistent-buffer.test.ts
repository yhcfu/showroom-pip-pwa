import { describe, expect, it } from "vitest";
import {
  BUFFER_DESIRED_BYTES,
  BUFFER_RETENTION_MS,
  buildBufferSessionKey,
  buildReplayPlan,
  computeAdaptiveByteLimit,
  findReplayMarker,
  type SegmentMeta,
} from "./persistent-buffer";

function segment(sequence: number | "initSegment", overrides: Partial<SegmentMeta> = {}): SegmentMeta {
  return {
    id: `segment-${sequence}`,
    sessionKey: "room-session",
    level: 1,
    sequence,
    duration: sequence === "initSegment" ? 0 : 4,
    cc: 0,
    programDateTime: sequence === "initSegment" ? null : 1_700_000_000_000 + Number(sequence) * 4000,
    storedAt: 1_700_000_000_000 + (sequence === "initSegment" ? 0 : Number(sequence)),
    byteLength: 1024,
    ...overrides,
  };
}

describe("persistent live buffer", () => {
  it("retains cached segments for 24 hours with a 1 GiB desired cap", () => {
    expect(BUFFER_RETENTION_MS).toBe(86_400_000);
    expect(BUFFER_DESIRED_BYTES).toBe(1024 ** 3);
  });

  it("shrinks the cache budget when browser storage is constrained", () => {
    expect(computeAdaptiveByteLimit({ quota: 2_000, usage: 1_600 }, 200, 1_000)).toBe(300);
    expect(computeAdaptiveByteLimit({}, 0, 1_000)).toBe(1_000);
  });

  it("uses a stable room and stream identity", () => {
    expect(buildBufferSessionKey("room", "https://cdn.example/live.m3u8"))
      .toBe(buildBufferSessionKey("room", "https://cdn.example/live.m3u8"));
    expect(buildBufferSessionKey("room", "https://cdn.example/a.m3u8"))
      .not.toBe(buildBufferSessionKey("room", "https://cdn.example/b.m3u8"));
  });

  it("builds a finite replay playlist from the contiguous run containing the saved position", () => {
    const plan = buildReplayPlan(
      [segment("initSegment"), segment(10), segment(11), segment(13), segment(14)],
      { level: 1, sequence: 11, offset: 2.5, savedAt: Date.now() },
      "https://player.example",
    );

    expect(plan).not.toBeNull();
    expect(plan?.segments.map((entry) => entry.sequence)).toEqual([10, 11]);
    expect(plan?.startPosition).toBe(6.5);
    expect(plan?.playlist).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(plan?.playlist).toContain("#EXT-X-ENDLIST");
    expect(plan?.playlist).toContain("#EXT-X-MAP:URI=");
    expect(plan?.playlist).toContain("https://player.example/__showroom_buffer__/");
  });

  it("maps replay time back to the original HLS sequence", () => {
    const plan = buildReplayPlan(
      [segment(20), segment(21), segment(22)],
      { level: 1, sequence: 20, offset: 0, savedAt: Date.now() },
      "https://player.example",
    );
    expect(plan).not.toBeNull();
    const marker = findReplayMarker(plan!, 5.25);
    expect(marker.level).toBe(1);
    expect(marker.sequence).toBe(21);
    expect(marker.offset).toBe(1.25);
  });

  it("keeps a contiguous timeline across rendition changes", () => {
    const plan = buildReplayPlan(
      [
        segment("initSegment", { id: "init-1", level: 1 }),
        segment("initSegment", { id: "init-2", level: 2 }),
        segment(30, { level: 1 }),
        segment(31, { level: 2 }),
        segment(32, { level: 2 }),
      ],
      { level: 2, sequence: 31, offset: 1, savedAt: Date.now() },
      "https://player.example",
    );
    expect(plan?.segments.map((entry) => [entry.sequence, entry.level])).toEqual([[30, 1], [31, 2], [32, 2]]);
    expect(plan?.playlist.match(/#EXT-X-DISCONTINUITY/g)).toHaveLength(1);
    expect(plan?.playlist.match(/#EXT-X-MAP/g)).toHaveLength(2);
  });
});
