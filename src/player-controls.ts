export const PLAYER_CONTROLS_IDLE_MS = 900;
export const CLIP_PREVIEW_MAIN_VOLUME = 0.08;
export const MAX_CLIP_DURATION_SECONDS = 60;

export function constrainClipRange({
  start,
  end,
  maximum,
  minimumWidth,
  changed,
}: {
  start: number;
  end: number;
  maximum: number;
  minimumWidth: number;
  changed: "start" | "end" | null;
}): { start: number; end: number } {
  start = Math.max(0, Math.min(start, maximum));
  end = Math.max(0, Math.min(end, maximum));
  if (end <= start && maximum > 0) {
    if (changed === "start") start = Math.max(0, end - minimumWidth);
    else end = Math.min(maximum, start + minimumWidth);
  }
  if (end - start > MAX_CLIP_DURATION_SECONDS) {
    if (changed === "end") start = Math.max(0, end - MAX_CLIP_DURATION_SECONDS);
    else end = Math.min(maximum, start + MAX_CLIP_DURATION_SECONDS);
  }
  return { start, end };
}

export function volumeDuringClipPreview(currentVolume: number): number {
  return Math.min(currentVolume, CLIP_PREVIEW_MAIN_VOLUME);
}

export function shouldStopClipPreview(currentTime: number, endTime: number): boolean {
  return currentTime >= endTime;
}

export function shouldKeepPlayerControlsVisible(state: {
  finePointer: boolean;
  playing: boolean;
  buffering: boolean;
  keyboardFocusWithin: boolean;
  panelOpen: boolean;
  blockingStatus: boolean;
}): boolean {
  return !state.finePointer ||
    !state.playing ||
    state.buffering ||
    state.keyboardFocusWithin ||
    state.panelOpen ||
    state.blockingStatus;
}
