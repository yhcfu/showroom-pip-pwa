import { describe, expect, it } from "vitest";
import { clampBalance, formatBalance, parseStoredBalance } from "./audio-balance";

describe("audio balance", () => {
  it("clamps values to the stereo panner range", () => {
    expect(clampBalance(-2)).toBe(-1);
    expect(clampBalance(0.25)).toBe(0.25);
    expect(clampBalance(4)).toBe(1);
    expect(clampBalance(Number.NaN)).toBe(0);
  });

  it("parses stored values safely", () => {
    expect(parseStoredBalance(null)).toBe(0);
    expect(parseStoredBalance("invalid")).toBe(0);
    expect(parseStoredBalance("-0.4")).toBe(-0.4);
    expect(parseStoredBalance("10")).toBe(1);
  });

  it("formats a compact direction label", () => {
    expect(formatBalance(0)).toBe("C");
    expect(formatBalance(-0.65)).toBe("L65");
    expect(formatBalance(0.42)).toBe("R42");
  });
});
