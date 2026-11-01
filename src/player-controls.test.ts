import { describe, expect, it } from "vitest";
import {
  CLIP_PREVIEW_MAIN_VOLUME,
  MAX_CLIP_DURATION_SECONDS,
  PLAYER_CONTROLS_IDLE_MS,
  constrainClipRange,
  shouldKeepPlayerControlsVisible,
  shouldStopClipPreview,
  volumeDuringClipPreview,
} from "./player-controls";

const passivePlayback = {
  finePointer: true,
  playing: true,
  buffering: false,
  keyboardFocusWithin: false,
  panelOpen: false,
  blockingStatus: false,
};

describe("player controls visibility", () => {
  it("keeps clip selection within one minute around the changed boundary", () => {
    expect(constrainClipRange({ start: 20, end: 100, maximum: 200, minimumWidth: 1 / 30, changed: "start" }))
      .toEqual({ start: 20, end: 20 + MAX_CLIP_DURATION_SECONDS });
    expect(constrainClipRange({ start: 20, end: 100, maximum: 200, minimumWidth: 1 / 30, changed: "end" }))
      .toEqual({ start: 100 - MAX_CLIP_DURATION_SECONDS, end: 100 });
  });

  it("keeps the selected boundaries ordered", () => {
    expect(constrainClipRange({ start: 10, end: 5, maximum: 20, minimumWidth: 0.5, changed: "start" }))
      .toEqual({ start: 4.5, end: 5 });
    expect(constrainClipRange({ start: 10, end: 5, maximum: 20, minimumWidth: 0.5, changed: "end" }))
      .toEqual({ start: 10, end: 10.5 });
  });

  it("ducks the main video without raising an already quiet volume", () => {
    expect(volumeDuringClipPreview(1)).toBe(CLIP_PREVIEW_MAIN_VOLUME);
    expect(volumeDuringClipPreview(0.04)).toBe(0.04);
  });

  it("stops clip preview at the selected end", () => {
    expect(shouldStopClipPreview(5.99, 6)).toBe(false);
    expect(shouldStopClipPreview(6, 6)).toBe(true);
  });

  it("hides desktop controls after a short period of passive playback", () => {
    expect(PLAYER_CONTROLS_IDLE_MS).toBe(900);
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
