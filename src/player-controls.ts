export const PLAYER_CONTROLS_IDLE_MS = 2500;

export function shouldKeepPlayerControlsVisible(state: {
  finePointer: boolean;
  playing: boolean;
  buffering: boolean;
  focusWithin: boolean;
  panelOpen: boolean;
  blockingStatus: boolean;
}): boolean {
  return !state.finePointer ||
    !state.playing ||
    state.buffering ||
    state.focusWithin ||
    state.panelOpen ||
    state.blockingStatus;
}
