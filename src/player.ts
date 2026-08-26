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
import { LIVE_HLS_CONFIG } from "./live-playback";
import { PLAYER_CONTROLS_IDLE_MS, shouldKeepPlayerControlsVisible } from "./player-controls";
import { resolveRoom } from "./resolver";
import { buildScreenshotFilename, copyPngToClipboard, shouldCaptureFromShortcut } from "./screenshot";
import { buildPlayerUrl, buildRoomPlayerUrl, readPlayerHandoff, readRoomKeyFromPlayerUrl, type PlayerHandoff } from "./showroom";

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
const screenshotLabel = document.querySelector<HTMLElement>("#screenshot-label")!;
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
    focusWithin: overlay.matches(":focus-within"),
    panelOpen: !balancePanel.hidden,
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

function enablePipWhenReady() {
  const standardPip = document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function";
  const webkitPip = video.webkitSupportsPresentationMode?.("picture-in-picture") === true;
  pipButton.disabled = video.readyState === HTMLMediaElement.HAVE_NOTHING || (!standardPip && !webkitPip);
  setStatus("");
}

function enableScreenshotWhenReady() {
  screenshotButton.disabled = video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0;
}

function showScreenshotSuccess(copied: boolean) {
  const message = copied ? "画像を保存・コピーしました。" : "画像を保存しました（コピー不可）。";
  setStatus(message);
  screenshotButton.classList.add("is-success");
  screenshotButton.setAttribute("aria-label", message);
  screenshotButton.title = message;
  screenshotLabel.textContent = "保存済み";
  window.clearTimeout(screenshotStatusTimer);
  screenshotStatusTimer = window.setTimeout(() => {
    screenshotButton.classList.remove("is-success");
    screenshotButton.setAttribute("aria-label", "スクリーンショットを保存・コピー");
    screenshotButton.title = "スクリーンショットを保存・コピー (S)";
    screenshotLabel.textContent = "撮影";
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

video.addEventListener("loadedmetadata", () => {
  enablePipWhenReady();
  enableScreenshotWhenReady();
});
video.addEventListener("loadeddata", enableScreenshotWhenReady);
video.addEventListener("emptied", () => {
  stage.classList.remove("playing", "buffering");
  revealControls(false);
  pipButton.disabled = true;
  screenshotButton.disabled = true;
});
video.addEventListener("error", () => {
  stage.classList.remove("playing", "buffering");
  pipButton.disabled = true;
  screenshotButton.disabled = true;
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
});

stage.addEventListener("pointermove", () => revealControls(), { passive: true });
stage.addEventListener("pointerdown", () => revealControls(), { passive: true });
stage.addEventListener("focusin", (event) => {
  const target = event.target;
  revealControls(!(target instanceof Node && overlay.contains(target)));
});
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

async function loadStream(handoff: PlayerHandoff) {
  hls?.destroy();
  hls = null;
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
      const instance = new Hls(LIVE_HLS_CONFIG);
      hls = instance;
      instance.loadSource(handoff.streamUrl);
      instance.attachMedia(video);
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          pipButton.disabled = true;
          setStatus(`HLS再生エラー: ${data.details}`, true);
        }
      });
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
  try {
    await video.play();
  } catch {
    if (video.readyState !== HTMLMediaElement.HAVE_NOTHING) enablePipWhenReady();
  }
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

balanceButton.addEventListener("click", () => {
  const open = balancePanel.hidden;
  setBalancePanel(open);
  if (open) void applyAudioBalance(Number(balanceInput.value));
});

balanceInput.addEventListener("input", () => {
  void applyAudioBalance(Number(balanceInput.value));
});

document.addEventListener("keydown", (event) => {
  revealControls();
  if (event.key === "Escape") setBalancePanel(false);
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
