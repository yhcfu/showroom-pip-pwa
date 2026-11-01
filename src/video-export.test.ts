import { describe, expect, it } from "vitest";
import type { ReplayPlan, ResumeMarker } from "./persistent-buffer";
import {
  buildClipFilename,
  formatClipTime,
  formatClipTimeInput,
  markerTime,
  parseClipTime,
  replayDuration,
  selectMp4MimeType,
} from "./video-export";

const plan: ReplayPlan = {
  playlist: "#EXTM3U",
  startPosition: 0,
  segments: [
    {
      id: "segment-10",
      sessionKey: "room-session",
      level: 1,
      sequence: 10,
      duration: 4,
      cc: 0,
      programDateTime: null,
      storedAt: 1,
      byteLength: 1024,
      timelineStart: 0,
    },
    {
      id: "segment-11",
      sessionKey: "room-session",
      level: 2,
      sequence: 11,
      duration: 5,
      cc: 0,
      programDateTime: null,
      storedAt: 2,
      byteLength: 1024,
      timelineStart: 4,
    },
  ],
};

describe("buffered MP4 export", () => {
  it("maps the current HLS marker into the replay timeline", () => {
    const marker: ResumeMarker = { level: 2, sequence: 11, offset: 2.5, savedAt: 1 };
    expect(markerTime(plan, marker)).toBe(6.5);
    expect(replayDuration(plan)).toBe(9);
  });

  it("clamps the marker offset and falls back to the buffer end", () => {
    expect(markerTime(plan, { level: 2, sequence: 11, offset: 20, savedAt: 1 })).toBe(9);
    expect(markerTime(plan, { level: 1, sequence: 99, offset: 0, savedAt: 1 })).toBe(9);
  });

  it("formats long and short timeline positions", () => {
    expect(formatClipTime(65.9)).toBe("1:05");
    expect(formatClipTime(3661)).toBe("1:01:01");
    expect(formatClipTimeInput(65.25)).toBe("1:05.250");
    expect(formatClipTimeInput(3661.125)).toBe("1:01:01.125");
  });

  it("parses direct time input without accepting invalid clock values", () => {
    expect(parseClipTime("1:05.250")).toBe(65.25);
    expect(parseClipTime("1:01:01.125")).toBe(3661.125);
    expect(parseClipTime("3.5")).toBe(3.5);
    expect(parseClipTime("1:60")).toBeNull();
    expect(parseClipTime("1.5:30")).toBeNull();
    expect(parseClipTime("time")).toBeNull();
  });

  it("builds a filesystem-safe MP4 name", () => {
    expect(buildClipFilename("room/key", new Date("2026-11-01T04:05:06.789Z")))
      .toBe("showroom-room-key-2026-11-01T04-05-06-789Z.mp4");
  });

  it("prefers H.264 and AAC before the browser's generic MP4 profile", () => {
    expect(selectMp4MimeType((type) => type.includes("mp4a"))).toContain("mp4a.40.2");
    expect(selectMp4MimeType((type) => type === "video/mp4")).toBe("video/mp4");
    expect(selectMp4MimeType(() => false)).toBeNull();
  });
});
