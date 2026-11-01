import "./style.css";
import {
  AUDIO_BALANCE_KEY,
  DESKTOP_AUDIO_BALANCE_QUERY,
  clampBalance,
  formatBalance,
  isChromiumUserAgent,
  parseStoredBalance,
  shouldOfferAudioBalance,
} from "./audio-balance";
import { parseRoomHistory, upsertRoomHistory } from "./history";
import { highestQualityLevel, LIVE_HLS_CONFIG } from "./live-playback";
import {
  buildBufferSessionKey,
  createPersistentFragmentLoader,
  findReplayMarker,
  PersistentBufferStore,
  type ReplayPlan,
  type ResumeMarker,
} from "./persistent-buffer";
import { PLAYER_CONTROLS_IDLE_MS, shouldKeepPlayerControlsVisible } from "./player-controls";
import { resolveRoom } from "./resolver";
import { buildScreenshotFilename, copyPngToClipboard, shouldCaptureFromShortcut } from "./screenshot";
import { buildPlayerUrl, buildRoomPlayerUrl, readPlayerHandoff, readRoomKeyFromPlayerUrl, type PlayerHandoff } from "./showroom";
import {
  buildClipFilename,
  canExportMp4,
  formatClipTime,
  formatClipTimeInput,
  markerTime,
  parseClipTime,
  recordMp4Range,
  replayDuration,
} from "./video-export";

declare global {
  interface HTMLVideoElement {
    webkitPresentationMode?: string;
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
  }
}

const HISTORY_KEY = "showroom-pip-history-v1";
const resolverUrl = import.meta.env.VITE_RESOLVER_URL || "";
const stage = document.querySelector<HTMLElement>(".player-stage")!;
const overlay = document.querySelector<HTMLElement>(".player-overlay")!;
const video = document.querySelector<HTMLVideoElement>("#video")!;
const shareButton = document.querySelector<HTMLButtonElement>("#share-button")!;
const shareLabel = document.querySelector<HTMLElement>("#share-label")!;
const balanceButton = document.querySelector<HTMLButtonElement>("#balance-button")!;
const balancePanel = document.querySelector<HTMLElement>("#balance-panel")!;
const balanceInput = document.querySelector<HTMLInputElement>("#balance")!;
const balanceValue = document.querySelector<HTMLOutputElement>("#balance-value")!;
const screenshotButton = document.querySelector<HTMLButtonElement>("#screenshot-button")!;
const clipButton = document.querySelector<HTMLButtonElement>("#clip-button")!;
const clipPanel = document.querySelector<HTMLElement>("#clip-panel")!;
const clipPreview = document.querySelector<HTMLVideoElement>("#clip-preview")!;
const clipTimeline = document.querySelector<HTMLElement>("#clip-timeline")!;
const clipStart = document.querySelector<HTMLInputElement>("#clip-start")!;
const clipEnd = document.querySelector<HTMLInputElement>("#clip-end")!;
const clipStartText = document.querySelector<HTMLInputElement>("#clip-start-text")!;
const clipEndText = document.querySelector<HTMLInputElement>("#clip-end-text")!;
const clipStartField = document.querySelector<HTMLElement>("#clip-start-field")!;
const clipEndField = document.querySelector<HTMLElement>("#clip-end-field")!;
const clipActiveLabel = document.querySelector<HTMLElement>("#clip-active-label")!;
const clipFrameBack = document.querySelector<HTMLButtonElement>("#clip-frame-back")!;
const clipFrameForward = document.querySelector<HTMLButtonElement>("#clip-frame-forward")!;
const clipNow = document.querySelector<HTMLButtonElement>("#clip-now")!;
const clipDuration = document.querySelector<HTMLElement>("#clip-duration")!;
const clipSave = document.querySelector<HTMLButtonElement>("#clip-save")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const pipLabel = document.querySelector<HTMLElement>("#pip-label")!;
const fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-button")!;
const fullscreenLabel = document.querySelector<HTMLElement>("#fullscreen-label")!;
const emptyState = document.querySelector<HTMLElement>("#empty-state")!;
const emptyMessage = document.querySelector<HTMLElement>("#empty-message")!;
const status = document.querySelector<HTMLElement>("#status")!;
const backToApp = document.querySelector<HTMLAnchorElement>("#back-to-app")!;
const appBase = new URL(`${import.meta.env.BASE_URL}app/`, location.origin);
const finePointerQuery = matchMedia(DESKTOP_AUDIO_BALANCE_QUERY);
backToApp.href = appBase.toString();

let hls: import("hls.js").default | null = null;
let shareUrl: string | null = null;
let currentRoomKey: string | undefined;
let audioContext: AudioContext | null = null;
let audioSource: MediaElementAudioSourceNode | null = null;
let stereoPanner: StereoPannerNode | null = null;
let balanceEnabled = false;
let copyResetTimer: number | undefined;
let screenshotStatusTimer: number | undefined;
let controlsIdleTimer: number | undefined;
let bufferStore: PersistentBufferStore | null = null;
let bufferSessionKey: string | null = null;
let replayPlan: ReplayPlan | null = null;
let clipPlan: ReplayPlan | null = null;
let clipPreviewHls: import("hls.js").default | null = null;
let clipPreviewManifestUrl: string | null = null;
let replayManifestUrl: string | null = null;
let currentLiveFragment: import("hls.js").Fragment | null = null;
let replaying = false;
let switchingToLive = false;
let lastResumeSaveAt = 0;
let keyboardNavigation = false;
let exportingClip = false;
let clipPreviewReady = false;
let activeClipBoundary: "start" | "end" = "start";

const RESUME_MARKER_PREFIX = "showroom-pip-resume-v1:";

function isDesktopChromium(): boolean {
  return finePointerQuery.matches && isChromiumUserAgent(navigator.userAgent);
}

function clearControlsIdleTimer() {
  window.clearTimeout(controlsIdleTimer);
  controlsIdleTimer = undefined;
}

function keepControlsVisible(): boolean {
  return shouldKeepPlayerControlsVisible({
    finePointer: finePointerQuery.matches,
    playing: stage.classList.contains("playing"),
    buffering: stage.classList.contains("buffering"),
    keyboardFocusWithin: keyboardNavigation && overlay.matches(":focus-within"),
    panelOpen: !balancePanel.hidden || !clipPanel.hidden,
    blockingStatus: !status.hidden && status.classList.contains("error"),
  });
}

function revealControls(scheduleHide = true) {
  stage.classList.remove("controls-idle");
  clearControlsIdleTimer();
  if (!scheduleHide || keepControlsVisible()) return;
  controlsIdleTimer = window.setTimeout(() => {
    controlsIdleTimer = undefined;
    if (!keepControlsVisible()) stage.classList.add("controls-idle");
  }, PLAYER_CONTROLS_IDLE_MS);
}

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.hidden = message.length === 0;
  status.classList.toggle("error", isError);
  emptyState.classList.toggle("error", isError);
  if (isError) emptyMessage.textContent = message;
  if (isError) revealControls(false);
}

function readResumeMarker(sessionKey: string): ResumeMarker | null {
  try {
    const storageKey = `${RESUME_MARKER_PREFIX}${sessionKey}`;
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<ResumeMarker> | null;
    if (!value || !Number.isInteger(value.level) || !Number.isInteger(value.sequence) || !Number.isFinite(value.offset) || !Number.isFinite(value.savedAt)) return null;
    if (Date.now() - Number(value.savedAt) > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return value as ResumeMarker;
  } catch {
    return null;
  }
}

function currentResumeMarker(savedAt = Date.now()): ResumeMarker | null {
  if (replaying && replayPlan) {
    const marker = findReplayMarker(replayPlan, video.currentTime);
    marker.savedAt = savedAt;
    return marker;
  }
  if (currentLiveFragment && typeof currentLiveFragment.sn === "number") {
    return {
      level: currentLiveFragment.level,
      sequence: currentLiveFragment.sn,
      offset: Math.max(0, Math.min(currentLiveFragment.duration, video.currentTime - currentLiveFragment.start)),
      savedAt,
    };
  }
  return null;
}

function writeResumeMarker(force = false) {
  if (!bufferSessionKey) return;
  const now = Date.now();
  if (!force && now - lastResumeSaveAt < 1000) return;
  const marker = currentResumeMarker(now);
  if (!marker) return;
  try {
    localStorage.setItem(`${RESUME_MARKER_PREFIX}${bufferSessionKey}`, JSON.stringify(marker));
    lastResumeSaveAt = now;
  } catch {
    // Playback remains usable when private mode or quota policy blocks local storage.
  }
}

function enablePipWhenReady() {
  const standardPip = document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function";
  const webkitPip = video.webkitSupportsPresentationMode?.("picture-in-picture") === true;
  pipButton.disabled = video.readyState === HTMLMediaElement.HAVE_NOTHING || (!standardPip && !webkitPip);
  setStatus("");
}

function enableScreenshotWhenReady() {
  screenshotButton.disabled = video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0;
}

function enableClipWhenReady() {
  const supported = bufferStore !== null && canExportMp4(video);
  clipButton.hidden = !supported;
  clipButton.disabled = !supported || currentResumeMarker() === null;
  if (!supported && !exportingClip) void setClipPanel(false);
}

function showScreenshotSuccess(copied: boolean) {
  const message = copied ? "画像を保存・コピーしました。" : "画像を保存しました（コピー不可）。";
  setStatus(message);
  screenshotButton.classList.add("is-success");
  screenshotButton.setAttribute("aria-label", message);
  screenshotButton.title = message;
  window.clearTimeout(screenshotStatusTimer);
  screenshotStatusTimer = window.setTimeout(() => {
    screenshotButton.classList.remove("is-success");
    screenshotButton.setAttribute("aria-label", "スクリーンショットを保存・コピー");
    screenshotButton.title = "スクリーンショットを保存・コピー (S)";
    if (status.textContent === message) setStatus("");
  }, 1200);
}

async function captureScreenshot() {
  if (screenshotButton.disabled) return;
  screenshotButton.disabled = true;
  screenshotButton.setAttribute("aria-busy", "true");
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を作成できませんでした。");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blobPromise = new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画像を作成できませんでした。")), "image/png");
    });
    const clipboardCopy = copyPngToClipboard(
      blobPromise,
      typeof navigator.clipboard?.write === "function" && typeof ClipboardItem !== "undefined"
        ? {
            createItem: (png) => new ClipboardItem({ "image/png": png }),
            write: (items) => navigator.clipboard.write(items),
          }
        : null,
    );
    const blob = await blobPromise;
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = buildScreenshotFilename(currentRoomKey);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showScreenshotSuccess(await clipboardCopy);
  } catch {
    setStatus("この配信では画像を保存できません。", true);
  } finally {
    screenshotButton.removeAttribute("aria-busy");
    enableScreenshotWhenReady();
  }
}

function setPipState(active: boolean) {
  pipButton.setAttribute("aria-pressed", String(active));
  pipButton.setAttribute("aria-label", active ? "ピクチャーインピクチャーを終了" : "ピクチャーインピクチャー");
  pipButton.title = active ? "ピクチャーインピクチャーを終了" : "ピクチャーインピクチャー";
  pipLabel.textContent = active ? "終了" : "PiP";
}

function setFullscreenState(active: boolean) {
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", active ? "全画面を終了" : "全画面");
  fullscreenButton.title = active ? "全画面を終了" : "全画面";
  fullscreenLabel.textContent = active ? "終了" : "全画面";
}

function setBalancePanel(open: boolean) {
  balancePanel.hidden = !open;
  balanceButton.setAttribute("aria-expanded", String(open));
  revealControls(!open);
}

function updateBalanceDisplay(value: number) {
  const balance = clampBalance(value);
  balanceInput.value = String(balance);
  balanceValue.value = formatBalance(balance);
  balanceInput.setAttribute("aria-valuetext", balanceValue.value);
  const accessibleLabel = `左右の音声バランス ${balanceValue.value}`;
  balanceButton.setAttribute("aria-label", accessibleLabel);
  balanceButton.title = accessibleLabel;
}

function enableAudioBalance() {
  const hasAudioContext = typeof AudioContext !== "undefined";
  const supported = shouldOfferAudioBalance({
    desktopPointer: finePointerQuery.matches,
    chromium: isChromiumUserAgent(navigator.userAgent),
    audioContext: hasAudioContext,
    stereoPanner: hasAudioContext && typeof AudioContext.prototype.createStereoPanner === "function",
  });
  balanceEnabled = supported;
  balanceButton.hidden = !supported;
  if (!supported) setBalancePanel(false);
  updateBalanceDisplay(parseStoredBalance(localStorage.getItem(AUDIO_BALANCE_KEY)));
}

async function applyAudioBalance(value: number) {
  if (!balanceEnabled) return;
  const balance = clampBalance(value);
  updateBalanceDisplay(balance);
  localStorage.setItem(AUDIO_BALANCE_KEY, String(balance));
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
      audioSource = audioContext.createMediaElementSource(video);
      stereoPanner = audioContext.createStereoPanner();
      audioSource.connect(stereoPanner).connect(audioContext.destination);
    }
    if (!stereoPanner) throw new Error("StereoPannerNodeを初期化できませんでした。");
    stereoPanner.pan.value = balance;
    if (audioContext.state === "suspended") await audioContext.resume();
    balanceButton.dataset.audioState = "active";
    balanceInput.dataset.appliedValue = String(stereoPanner.pan.value);
  } catch {
    balanceEnabled = false;
    delete balanceButton.dataset.audioState;
    delete balanceInput.dataset.appliedValue;
    balanceButton.hidden = true;
    setBalancePanel(false);
    setStatus("L/Rを利用できません。", true);
  }
}

function releaseClipPreview() {
  clipPreviewReady = false;
  clipPreviewHls?.destroy();
  clipPreviewHls = null;
  if (clipPreviewManifestUrl) URL.revokeObjectURL(clipPreviewManifestUrl);
  clipPreviewManifestUrl = null;
  clipPreview.pause();
  clipPreview.removeAttribute("src");
  clipPreview.load();
}

function clipFrameDuration(): number {
  const level = currentLiveFragment?.level ?? hls?.currentLevel ?? 0;
  const frameRate = hls?.levels[level]?.frameRate || 30;
  return 1 / frameRate;
}

function setActiveClipBoundary(boundary: "start" | "end") {
  activeClipBoundary = boundary;
  const startActive = boundary === "start";
  clipStartField.dataset.active = String(startActive);
  clipEndField.dataset.active = String(!startActive);
  clipActiveLabel.textContent = `${startActive ? "開始" : "終了"}位置を調整`;
  clipFrameBack.setAttribute("aria-label", `${startActive ? "開始" : "終了"}位置を1フレーム戻す`);
  clipFrameForward.setAttribute("aria-label", `${startActive ? "開始" : "終了"}位置を1フレーム進める`);
  const frameRate = Math.round(1 / clipFrameDuration());
  clipFrameBack.title = `${frameRate}fps換算で1フレーム戻す`;
  clipFrameForward.title = `${frameRate}fps換算で1フレーム進める`;
}

function seekClipPreview(boundary = activeClipBoundary) {
  if (!clipPreviewReady) return;
  clipPreview.pause();
  clipPreview.currentTime = Number(boundary === "start" ? clipStart.value : clipEnd.value);
}

function updateClipRange(changed: "start" | "end" | null = null, preview = true) {
  const maximum = Number(clipStart.max);
  let start = Math.max(0, Math.min(Number(clipStart.value), maximum));
  let end = Math.max(0, Math.min(Number(clipEnd.value), maximum));
  const minimumWidth = clipFrameDuration();
  if (end <= start && maximum > 0) {
    if (changed === "start") start = Math.max(0, end - minimumWidth);
    else end = Math.min(maximum, start + minimumWidth);
  }
  clipStart.value = String(start);
  clipEnd.value = String(end);
  clipStartText.value = formatClipTimeInput(start);
  clipEndText.value = formatClipTimeInput(end);
  clipStart.setAttribute("aria-valuetext", formatClipTimeInput(start));
  clipEnd.setAttribute("aria-valuetext", formatClipTimeInput(end));
  const startPercent = maximum > 0 ? start / maximum * 100 : 0;
  const endPercent = maximum > 0 ? end / maximum * 100 : 100;
  clipTimeline.style.setProperty("--clip-start-percent", `${startPercent}%`);
  clipTimeline.style.setProperty("--clip-end-percent", `${endPercent}%`);
  clipDuration.textContent = `${formatClipTime(Math.max(0, end - start))}・実時間`;
  clipStart.disabled = exportingClip;
  clipEnd.disabled = exportingClip;
  clipStartText.disabled = exportingClip;
  clipEndText.disabled = exportingClip;
  clipFrameBack.disabled = exportingClip || !clipPreviewReady;
  clipFrameForward.disabled = exportingClip || !clipPreviewReady;
  clipNow.disabled = exportingClip;
  clipSave.disabled = exportingClip || !clipPlan || !clipPreviewReady || end <= start;
  if (changed) {
    setActiveClipBoundary(changed);
    if (preview) seekClipPreview(changed);
  }
}

async function refreshClipPlan(marker: ResumeMarker): Promise<number> {
  if (!bufferStore) throw new Error("保存済み映像がまだありません。");
  const plan = await bufferStore.replay(marker, location.origin);
  if (!plan || plan.segments.length === 0) throw new Error("切り出せる映像がまだありません。");
  clipPlan = plan;
  const maximum = replayDuration(plan);
  clipStart.max = String(maximum);
  clipEnd.max = String(maximum);
  return Math.min(maximum, markerTime(plan, marker));
}

async function loadClipPreview(position: number) {
  if (!clipPlan || !bufferStore) throw new Error("切り出しプレビューを準備できませんでした。");
  releaseClipPreview();
  updateClipRange();
  const { default: Hls } = await import("hls.js/light");
  const FragmentLoader = createPersistentFragmentLoader(Hls.DefaultConfig.loader, bufferStore);
  clipPreviewManifestUrl = URL.createObjectURL(new Blob([clipPlan.playlist], { type: "application/vnd.apple.mpegurl" }));
  const instance = new Hls({
    ...LIVE_HLS_CONFIG,
    fLoader: FragmentLoader,
    startPosition: position,
    lowLatencyMode: false,
  });
  clipPreviewHls = instance;
  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("プレビューの準備がタイムアウトしました。")), 30_000);
    clipPreview.addEventListener("canplay", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
    clipPreview.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("切り出しプレビューを読み込めませんでした。"));
    }, { once: true });
    instance.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      window.clearTimeout(timer);
      reject(new Error(`HLSプレビューエラー: ${data.details}`));
    });
  });
  instance.loadSource(clipPreviewManifestUrl);
  instance.attachMedia(clipPreview);
  await ready;
  clipPreviewReady = true;
  clipPreview.currentTime = position;
  clipPreview.pause();
  updateClipRange();
}

async function setClipPanel(open: boolean) {
  if (!open) {
    if (exportingClip) return;
    clipPanel.hidden = true;
    clipButton.setAttribute("aria-expanded", "false");
    clipPlan = null;
    releaseClipPreview();
    revealControls();
    return;
  }

  const marker = currentResumeMarker();
  if (!marker) return;
  setBalancePanel(false);
  clipPanel.hidden = false;
  clipPanel.setAttribute("aria-busy", "true");
  clipButton.setAttribute("aria-expanded", "true");
  clipSave.disabled = true;
  setActiveClipBoundary("start");
  revealControls(false);
  try {
    const position = await refreshClipPlan(marker);
    const end = position > 0 ? position : Number(clipEnd.max);
    clipStart.value = String(Math.max(0, end - 30));
    clipEnd.value = String(end);
    updateClipRange(null, false);
    await loadClipPreview(Number(clipStart.value));
    setStatus("");
  } catch (error) {
    releaseClipPreview();
    setStatus(error instanceof Error ? error.message : "保存済み映像を確認できませんでした。", true);
  } finally {
    clipPanel.removeAttribute("aria-busy");
    updateClipRange();
  }
}

async function setClipBoundaryToCurrent() {
  const marker = currentResumeMarker();
  if (!marker) return;
  try {
    clipPanel.setAttribute("aria-busy", "true");
    const position = await refreshClipPlan(marker);
    if (activeClipBoundary === "start") {
      clipStart.value = String(position);
      if (position >= Number(clipEnd.value)) {
        clipStart.value = String(Math.max(0, position - clipFrameDuration()));
        clipEnd.value = String(position);
      }
    } else {
      clipEnd.value = String(position);
      if (position <= Number(clipStart.value)) clipStart.value = String(Math.max(0, position - clipFrameDuration()));
    }
    updateClipRange(activeClipBoundary, false);
    await loadClipPreview(position);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "現在位置を取得できませんでした。", true);
  } finally {
    clipPanel.removeAttribute("aria-busy");
  }
}

function applyClipTimeInput(boundary: "start" | "end") {
  const input = boundary === "start" ? clipStartText : clipEndText;
  const range = boundary === "start" ? clipStart : clipEnd;
  const parsed = parseClipTime(input.value);
  const valid = parsed !== null && parsed >= 0 && parsed <= Number(range.max);
  input.setAttribute("aria-invalid", String(!valid));
  if (!valid || parsed === null) {
    setActiveClipBoundary(boundary);
    clipActiveLabel.textContent = "時刻は m:ss.sss で入力";
    return;
  }
  input.removeAttribute("aria-invalid");
  range.value = String(parsed);
  updateClipRange(boundary);
}

function adjustClipFrame(direction: -1 | 1) {
  const range = activeClipBoundary === "start" ? clipStart : clipEnd;
  range.value = String(Number(range.value) + direction * clipFrameDuration());
  updateClipRange(activeClipBoundary);
}

function downloadClip(blob: Blob) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = buildClipFilename(currentRoomKey);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
}

async function exportClip() {
  if (!clipPlan || !bufferStore || !clipPreviewReady || exportingClip) return;
  const start = Number(clipStart.value);
  const end = Number(clipEnd.value);
  exportingClip = true;
  clipPanel.setAttribute("aria-busy", "true");
  clipSave.textContent = "準備中…";
  updateClipRange();
  setStatus("MP4を準備しています…");

  try {
    const duration = end - start;
    clipSave.textContent = "作成中…";
    const blob = await recordMp4Range(clipPreview, start, end, (position) => {
      setStatus(`MP4を作成中… ${formatClipTime(position - start)} / ${formatClipTime(duration)}`);
    });
    downloadClip(blob);
    setStatus(`MP4を保存しました（${formatClipTime(duration)}）。`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "MP4を保存できませんでした。", true);
  } finally {
    exportingClip = false;
    clipPanel.removeAttribute("aria-busy");
    clipSave.textContent = "MP4として保存";
    updateClipRange();
    seekClipPreview();
  }
}

video.addEventListener("loadedmetadata", () => {
  enablePipWhenReady();
  enableScreenshotWhenReady();
  enableClipWhenReady();
});
video.addEventListener("loadeddata", enableScreenshotWhenReady);
video.addEventListener("emptied", () => {
  stage.classList.remove("playing", "buffering");
  revealControls(false);
  pipButton.disabled = true;
  screenshotButton.disabled = true;
  clipButton.disabled = true;
});
video.addEventListener("error", () => {
  stage.classList.remove("playing", "buffering");
  pipButton.disabled = true;
  screenshotButton.disabled = true;
  clipButton.disabled = true;
  setStatus("動画を読み込めませんでした。配信が終了していないか確認してください。", true);
});
video.addEventListener("playing", () => {
  stage.classList.add("playing");
  stage.classList.remove("buffering");
  revealControls();
});
video.addEventListener("pause", () => {
  stage.classList.remove("playing", "buffering");
  revealControls(false);
});
video.addEventListener("waiting", () => {
  stage.classList.add("buffering");
  revealControls(false);
});
video.addEventListener("canplay", () => {
  stage.classList.remove("buffering");
  revealControls(!video.paused);
  enableClipWhenReady();
});
video.addEventListener("timeupdate", () => {
  writeResumeMarker();
});
video.addEventListener("ended", () => {
  if (replaying) void startLivePlayback();
});
window.addEventListener("pagehide", () => writeResumeMarker(true));

function revealFromPointer() {
  keyboardNavigation = false;
  stage.classList.remove("keyboard-navigation");
  revealControls();
}

stage.addEventListener("pointermove", revealFromPointer, { passive: true });
stage.addEventListener("pointerdown", revealFromPointer, { passive: true });
stage.addEventListener("focusin", () => revealControls());
stage.addEventListener("focusout", () => queueMicrotask(() => revealControls()));
window.addEventListener("focus", () => revealControls());
finePointerQuery.addEventListener("change", () => revealControls());

function rememberHandoff(handoff: PlayerHandoff) {
  if (!handoff.roomKey) return;
  const entries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
  const updated = upsertRoomHistory(entries, {
    roomKey: handoff.roomKey,
    roomId: handoff.roomId,
    roomName: handoff.roomName,
    lastOpenedAt: Date.now(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function releaseReplayManifest() {
  if (!replayManifestUrl) return;
  URL.revokeObjectURL(replayManifestUrl);
  replayManifestUrl = null;
}

async function playCurrentMedia() {
  try {
    await video.play();
  } catch {
    if (video.readyState !== HTMLMediaElement.HAVE_NOTHING) enablePipWhenReady();
  }
}

function lockHighestQuality(instance: import("hls.js").default, Hls: typeof import("hls.js").default) {
  const selectHighest = () => {
    const level = highestQualityLevel(instance.levels);
    if (level < 0) return;
    instance.autoLevelCapping = level;
    if (instance.currentLevel !== level && instance.loadLevel !== level) instance.currentLevel = level;
    else instance.loadLevel = level;
  };
  instance.on(Hls.Events.MANIFEST_PARSED, selectHighest);
  instance.on(Hls.Events.LEVELS_UPDATED, selectHighest);
}

async function startLivePlayback() {
  if (!bufferStore || !currentHandoff || switchingToLive) return;
  switchingToLive = true;
  writeResumeMarker(true);
  replaying = false;
  replayPlan = null;
  currentLiveFragment = null;
  enableClipWhenReady();
  releaseReplayManifest();
  hls?.destroy();
  hls = null;
  setStatus("ライブへ接続しています…");
  try {
    const { default: Hls } = await import("hls.js/light");
    const FragmentLoader = createPersistentFragmentLoader(Hls.DefaultConfig.loader, bufferStore);
    const instance = new Hls({ ...LIVE_HLS_CONFIG, fLoader: FragmentLoader });
    hls = instance;
    lockHighestQuality(instance, Hls);
    instance.on(Hls.Events.FRAG_CHANGED, (_event, data) => {
      currentLiveFragment = data.frag;
      writeResumeMarker();
      enableClipWhenReady();
    });
    instance.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        pipButton.disabled = true;
        setStatus(`HLS再生エラー: ${data.details}`, true);
      }
    });
    instance.loadSource(currentHandoff.streamUrl);
    instance.attachMedia(video);
    await playCurrentMedia();
  } finally {
    switchingToLive = false;
  }
}

let currentHandoff: PlayerHandoff | null = null;

async function startPersistentPlayback(handoff: PlayerHandoff, Hls: typeof import("hls.js").default) {
  const sessionKey = buildBufferSessionKey(handoff.roomKey, handoff.streamUrl);
  bufferSessionKey = sessionKey;
  bufferStore = new PersistentBufferStore(sessionKey, handoff.streamUrl, handoff.roomKey);
  const marker = readResumeMarker(sessionKey);
  const restored = marker ? await bufferStore.replay(marker, location.origin).catch(() => null) : null;
  if (!restored) {
    await startLivePlayback();
    return;
  }

  replaying = true;
  replayPlan = restored;
  enableClipWhenReady();
  setStatus("前回位置から再開しています");
  replayManifestUrl = URL.createObjectURL(new Blob([restored.playlist], { type: "application/vnd.apple.mpegurl" }));
  const FragmentLoader = createPersistentFragmentLoader(Hls.DefaultConfig.loader, bufferStore);
  const instance = new Hls({
    ...LIVE_HLS_CONFIG,
    fLoader: FragmentLoader,
    startPosition: restored.startPosition,
    lowLatencyMode: false,
  });
  hls = instance;
  lockHighestQuality(instance, Hls);
  instance.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal && replaying) void startLivePlayback();
  });
  instance.loadSource(replayManifestUrl);
  instance.attachMedia(video);
  await playCurrentMedia();
}

async function loadStream(handoff: PlayerHandoff) {
  hls?.destroy();
  hls = null;
  releaseReplayManifest();
  currentHandoff = handoff;
  bufferStore = null;
  bufferSessionKey = null;
  replaying = false;
  replayPlan = null;
  currentLiveFragment = null;
  clipPlan = null;
  clipPanel.hidden = true;
  clipButton.hidden = true;
  clipButton.disabled = true;
  clipButton.setAttribute("aria-expanded", "false");
  emptyState.hidden = true;
  pipButton.disabled = true;
  screenshotButton.disabled = true;
  currentRoomKey = handoff.roomKey;
  shareUrl = handoff.roomKey ? buildRoomPlayerUrl(handoff.roomKey, location.href) : null;
  shareButton.hidden = shareUrl === null;
  balanceEnabled = false;
  balanceButton.hidden = true;
  setBalancePanel(false);
  setStatus("配信を読み込んでいます…");

  const nativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
  const preferHlsJs = isDesktopChromium();
  if (!nativeHls || preferHlsJs) {
    const { default: Hls } = await import("hls.js/light");
    if (Hls.isSupported()) {
      video.crossOrigin = "anonymous";
      enableAudioBalance();
      await startPersistentPlayback(handoff, Hls);
    } else if (nativeHls) {
      video.src = handoff.streamUrl;
    } else {
      throw new Error("このブラウザはHLS再生に対応していません。");
    }
  } else {
    video.src = handoff.streamUrl;
  }

  rememberHandoff(handoff);
  history.replaceState(null, "", buildPlayerUrl(handoff.streamUrl, location.href, handoff));
  if (!hls) await playCurrentMedia();
}

shareButton.addEventListener("click", async () => {
  if (!shareUrl) return;
  try {
    await navigator.clipboard.writeText(shareUrl);
    window.clearTimeout(copyResetTimer);
    shareButton.classList.add("is-success");
    shareButton.setAttribute("aria-label", "共有URLをコピーしました");
    shareButton.title = "共有URLをコピーしました";
    shareLabel.textContent = "コピー済み";
    copyResetTimer = window.setTimeout(() => {
      shareButton.classList.remove("is-success");
      shareButton.setAttribute("aria-label", "共有URLをコピー");
      shareButton.title = "共有URLをコピー";
      shareLabel.textContent = "URL";
    }, 1200);
  } catch {
    setStatus("URLをコピーできませんでした。", true);
  }
});

screenshotButton.addEventListener("click", () => {
  void captureScreenshot();
});

clipButton.addEventListener("click", () => {
  void setClipPanel(clipPanel.hidden);
});

clipStart.addEventListener("input", () => updateClipRange("start"));
clipEnd.addEventListener("input", () => updateClipRange("end"));
clipStartText.addEventListener("focus", () => setActiveClipBoundary("start"));
clipEndText.addEventListener("focus", () => setActiveClipBoundary("end"));
clipStartText.addEventListener("change", () => applyClipTimeInput("start"));
clipEndText.addEventListener("change", () => applyClipTimeInput("end"));
clipFrameBack.addEventListener("click", () => adjustClipFrame(-1));
clipFrameForward.addEventListener("click", () => adjustClipFrame(1));
clipNow.addEventListener("click", () => void setClipBoundaryToCurrent());
clipSave.addEventListener("click", () => void exportClip());

balanceButton.addEventListener("click", () => {
  const open = balancePanel.hidden;
  if (open) void setClipPanel(false);
  setBalancePanel(open);
  if (open) void applyAudioBalance(Number(balanceInput.value));
});

balanceInput.addEventListener("input", () => {
  void applyAudioBalance(Number(balanceInput.value));
});

document.addEventListener("keydown", (event) => {
  keyboardNavigation = true;
  stage.classList.add("keyboard-navigation");
  revealControls();
  if (event.key === "Escape") {
    setBalancePanel(false);
    void setClipPanel(false);
  }
  const target = event.target;
  const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
  if (shouldCaptureFromShortcut({
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    desktop: finePointerQuery.matches,
    editing,
  }) && !screenshotButton.disabled) {
    event.preventDefault();
    void captureScreenshot();
  }
});

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (target instanceof Node && !balancePanel.contains(target) && !balanceButton.contains(target)) {
    setBalancePanel(false);
  }
  if (target instanceof Node && !clipPanel.contains(target) && !clipButton.contains(target)) {
    void setClipPanel(false);
  }
});

pipButton.addEventListener("click", async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
      await video.requestPictureInPicture();
    } else if (video.webkitSupportsPresentationMode?.("picture-in-picture")) {
      video.webkitSetPresentationMode?.("picture-in-picture");
    } else {
      throw new Error("このブラウザではPiPを開始できません。");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "PiPを開始できませんでした。", true);
  }
});

video.addEventListener("enterpictureinpicture", () => setPipState(true));
video.addEventListener("leavepictureinpicture", () => setPipState(false));
video.addEventListener("webkitpresentationmodechanged", () => {
  setPipState(video.webkitPresentationMode === "picture-in-picture");
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await video.requestFullscreen();
  } catch {
    setStatus("全画面表示を開始できませんでした。", true);
  }
});

document.addEventListener("fullscreenchange", () => {
  setFullscreenState(document.fullscreenElement !== null);
});

if (typeof video.requestFullscreen !== "function") fullscreenButton.hidden = true;
setPipState(false);
setFullscreenState(false);

try {
  const handoff = readPlayerHandoff(location.hash);
  const roomKey = readRoomKeyFromPlayerUrl(location.href);
  const pending = handoff
    ? Promise.resolve(handoff)
    : roomKey
      ? resolveRoom(roomKey, resolverUrl)
      : Promise.reject(new Error("再生するルームが指定されていません。"));
  void pending.then(loadStream).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "再生に失敗しました。", true);
  });
} catch (error) {
  setStatus(error instanceof Error ? error.message : "再生リンクを読み取れませんでした。", true);
}
