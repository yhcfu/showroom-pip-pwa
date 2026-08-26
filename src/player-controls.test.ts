import { describe, expect, it } from "vitest";
import { PLAYER_CONTROLS_IDLE_MS, shouldKeepPlayerControlsVisible } from "./player-controls";

const passivePlayback = {
  finePointer: true,
  playing: true,
  buffering: false,
  keyboardFocusWithin: false,
  panelOpen: false,
  blockingStatus: false,
};

describe("player controls visibility", () => {
  it("hides desktop controls after a short period of passive playback", () => {
    expect(PLAYER_CONTROLS_IDLE_MS).toBe(2000);
    expect(shouldKeepPlayerControlsVisible(passivePlayback)).toBe(false);
  });

  it.each([
    ["touch layout", { finePointer: false }],
    ["paused playback", { playing: false }],
    ["buffering", { buffering: true }],
    ["keyboard focus", { keyboardFocusWithin: true }],
    ["open panel", { panelOpen: true }],
    ["blocking status", { blockingStatus: true }],
  ])("keeps controls visible for %s", (_label, override) => {
    expect(shouldKeepPlayerControlsVisible({ ...passivePlayback, ...override })).toBe(true);
  });

  it("does not let pointer-created focus pin controls onscreen", () => {
    expect(shouldKeepPlayerControlsVisible({ ...passivePlayback, keyboardFocusWithin: false })).toBe(false);
  });
});
