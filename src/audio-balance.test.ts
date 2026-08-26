import { describe, expect, it } from "vitest";
import {
  DESKTOP_AUDIO_BALANCE_QUERY,
  clampBalance,
  formatBalance,
  isChromiumUserAgent,
  parseStoredBalance,
  shouldOfferAudioBalance,
} from "./audio-balance";

describe("audio balance", () => {
  it("uses a fine pointer and hover as the PC-only capability boundary", () => {
    expect(DESKTOP_AUDIO_BALANCE_QUERY).toBe("(hover: hover) and (pointer: fine)");
    expect(shouldOfferAudioBalance({ desktopPointer: false, chromium: true, audioContext: true, stereoPanner: true })).toBe(false);
    expect(shouldOfferAudioBalance({ desktopPointer: true, chromium: false, audioContext: true, stereoPanner: true })).toBe(false);
    expect(shouldOfferAudioBalance({ desktopPointer: true, chromium: true, audioContext: true, stereoPanner: true })).toBe(true);
  });

  it("recognizes desktop Chromium user agents without treating Safari as Chromium", () => {
    expect(isChromiumUserAgent("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36")).toBe(true);
    expect(isChromiumUserAgent("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0")).toBe(true);
    expect(isChromiumUserAgent("Mozilla/5.0 Version/18.0 Safari/605.1.15")).toBe(false);
  });

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
