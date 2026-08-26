export const PLAYER_CONTROLS_IDLE_MS = 2000;

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
