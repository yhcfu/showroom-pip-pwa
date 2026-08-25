import "./style.css";
import { parseRoomHistory, upsertRoomHistory } from "./history";
import { resolveRoom } from "./resolver";
import { buildPlayerUrl, readPlayerHandoff, readRoomKeyFromPlayerUrl, type PlayerHandoff } from "./showroom";

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
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-button")!;
const emptyState = document.querySelector<HTMLElement>("#empty-state")!;
const emptyMessage = document.querySelector<HTMLElement>("#empty-message")!;
const status = document.querySelector<HTMLElement>("#status")!;
const backToApp = document.querySelector<HTMLAnchorElement>("#back-to-app")!;
const appBase = new URL(`${import.meta.env.BASE_URL}app/`, location.origin);
backToApp.href = appBase.toString();

let hls: import("hls.js").default | null = null;

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
  emptyState.classList.toggle("error", isError);
  if (isError) emptyMessage.textContent = message;
}

function enablePipWhenReady() {
  const standardPip = document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function";
  const webkitPip = video.webkitSupportsPresentationMode?.("picture-in-picture") === true;
  pipButton.disabled = video.readyState === HTMLMediaElement.HAVE_NOTHING || (!standardPip && !webkitPip);
  if (!pipButton.disabled) setStatus("準備できました。");
}

video.addEventListener("loadedmetadata", enablePipWhenReady);
video.addEventListener("emptied", () => {
  pipButton.disabled = true;
});
video.addEventListener("error", () => {
  pipButton.disabled = true;
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
  setStatus("配信を読み込んでいます…");

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = handoff.streamUrl;
  } else {
    const { default: Hls } = await import("hls.js/light");
    if (!Hls.isSupported()) throw new Error("このブラウザはHLS再生に対応していません。");
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
  }

  rememberHandoff(handoff);
  history.replaceState(null, "", buildPlayerUrl(handoff.streamUrl, location.href, handoff));
  try {
    await video.play();
  } catch {
    if (video.readyState !== HTMLMediaElement.HAVE_NOTHING) enablePipWhenReady();
  }
}

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
  fullscreenButton.textContent = document.fullscreenElement ? "全画面を終了" : "全画面";
});

if (typeof video.requestFullscreen !== "function") fullscreenButton.hidden = true;

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
