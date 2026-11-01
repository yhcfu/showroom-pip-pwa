import { describe, expect, it } from "vitest";
import {
  MAX_IN_MEMORY_LOCAL_TS_BYTES,
  canUseInMemoryLocalTsOutput,
  isTransportStreamFile,
} from "./local-ts";

describe("local MPEG-TS playback", () => {
  it("accepts only .ts filenames", () => {
    expect(isTransportStreamFile({ name: "recording.ts" })).toBe(true);
    expect(isTransportStreamFile({ name: "RECORDING.TS" })).toBe(true);
    expect(isTransportStreamFile({ name: "recording.ts.txt" })).toBe(false);
  });

  it("keeps the memory fallback below the documented 100 MiB limit", () => {
    expect(canUseInMemoryLocalTsOutput(MAX_IN_MEMORY_LOCAL_TS_BYTES)).toBe(true);
    expect(canUseInMemoryLocalTsOutput(MAX_IN_MEMORY_LOCAL_TS_BYTES + 1)).toBe(false);
  });
});
