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
import { resolveRoom } from "./resolver";
import { buildScreenshotFilename, shouldCaptureFromShortcut } from "./screenshot";
import { buildPlayerUrl, buildRoomPlayerUrl, readPlayerHandoff, readRoomKeyFromPlayerUrl, type PlayerHandoff } from "./showroom";

declare global {
  interface HTMLVideoElement {
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
  }
}

const HISTORY_KEY = "showroom-pip-history-v1";
const resolverUrl = import.meta.env.VITE_RESOLVER_URL || "";
const stage = document.querySelector<HTMLElement>(".player-stage")!;
const video = document.querySelector<HTMLVideoElement>("#video")!;
const shareButton = document.querySelector<HTMLButtonElement>("#share-button")!;
const shareLabel = document.querySelector<HTMLElement>("#share-label")!;
const balanceButton = document.querySelector<HTMLButtonElement>("#balance-button")!;
const balancePanel = document.querySelector<HTMLElement>("#balance-panel")!;
const balanceInput = document.querySelector<HTMLInputElement>("#balance")!;
const balanceValue = document.querySelector<HTMLOutputElement>("#balance-value")!;
const screenshotButton = document.querySelector<HTMLButtonElement>("#screenshot-button")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-button")!;
const emptyState = document.querySelector<HTMLElement>("#empty-state")!;
const emptyMessage = document.querySelector<HTMLElement>("#empty-message")!;
const status = document.querySelector<HTMLElement>("#status")!;
const backToApp = document.querySelector<HTMLAnchorElement>("#back-to-app")!;
const appBase = new URL(`${import.meta.env.BASE_URL}app/`, location.origin);
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

function isDesktopChromium(): boolean {
  return matchMedia(DESKTOP_AUDIO_BALANCE_QUERY).matches && isChromiumUserAgent(navigator.userAgent);
}

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.hidden = message.length === 0;
  status.classList.toggle("error", isError);
  emptyState.classList.toggle("error", isError);
  if (isError) emptyMessage.textContent = message;
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

function showScreenshotSuccess() {
  const message = "画像を保存しました。";
  setStatus(message);
  window.clearTimeout(screenshotStatusTimer);
  screenshotStatusTimer = window.setTimeout(() => {
    if (status.textContent === message) setStatus("");
  }, 1200);
}

async function captureScreenshot() {
  if (screenshotButton.disabled) return;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を作成できませんでした。");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("画像を作成できませんでした。")), "image/png");
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = buildScreenshotFilename(currentRoomKey);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showScreenshotSuccess();
  } catch {
    setStatus("この配信では画像を保存できません。", true);
  }
}

function setBalancePanel(open: boolean) {
  balancePanel.hidden = !open;
  balanceButton.setAttribute("aria-expanded", String(open));
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
    desktopPointer: matchMedia(DESKTOP_AUDIO_BALANCE_QUERY).matches,
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
  pipButton.disabled = true;
  screenshotButton.disabled = true;
});
video.addEventListener("error", () => {
  pipButton.disabled = true;
  screenshotButton.disabled = true;
  setStatus("動画を読み込めませんでした。配信が終了していないか確認してください。", true);
});
video.addEventListener("playing", () => stage.classList.add("playing"));
video.addEventListener("pause", () => stage.classList.remove("playing"));

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
      const instance = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
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
  if (event.key === "Escape") setBalancePanel(false);
  const target = event.target;
  const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
  if (shouldCaptureFromShortcut({
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    desktop: matchMedia(DESKTOP_AUDIO_BALANCE_QUERY).matches,
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

fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await video.requestFullscreen();
  } catch {
    setStatus("全画面表示を開始できませんでした。", true);
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "×" : "⛶";
  fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "全画面を終了" : "全画面");
});

if (typeof video.requestFullscreen !== "function") fullscreenButton.hidden = true;
fullscreenButton.setAttribute("aria-label", "全画面");

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
