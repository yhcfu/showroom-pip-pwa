import "./style.css";
import { parseRoomHistory, upsertRoomHistory } from "./history";
import { buildPlayerUrl, readPlayerHandoff, type PlayerHandoff } from "./showroom";

declare global {
  interface HTMLVideoElement {
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
  }
}

const HISTORY_KEY = "showroom-pip-history-v1";
const video = document.querySelector<HTMLVideoElement>("#video")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy-player-url")!;
const emptyState = document.querySelector<HTMLElement>("#empty-state")!;
const status = document.querySelector<HTMLElement>("#status")!;
const backToApp = document.querySelector<HTMLAnchorElement>("#back-to-app")!;
const appBase = new URL(`${import.meta.env.BASE_URL}app/`, location.origin);
backToApp.href = appBase.toString();

let hls: import("hls.js").default | null = null;
let activeHandoff: PlayerHandoff | null = null;

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function enablePipWhenReady() {
  const standardPip = document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function";
  const webkitPip = video.webkitSupportsPresentationMode?.("picture-in-picture") === true;
  pipButton.disabled = video.readyState === HTMLMediaElement.HAVE_NOTHING || (!standardPip && !webkitPip);
  if (!pipButton.disabled) setStatus("準備できました。動画を再生してからPiPボタンを押してください。");
}

video.addEventListener("loadedmetadata", enablePipWhenReady);
video.addEventListener("emptied", () => {
  pipButton.disabled = true;
});
video.addEventListener("error", () => {
  pipButton.disabled = true;
  setStatus("動画を読み込めませんでした。配信が終了していないか確認してください。", true);
});

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
  activeHandoff = handoff;
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
  copyButton.disabled = false;
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

copyButton.addEventListener("click", async () => {
  if (!activeHandoff) return;
  await navigator.clipboard.writeText(buildPlayerUrl(activeHandoff.streamUrl, location.href, activeHandoff));
  setStatus("再生リンクをコピーしました。HLS URLを含むため共有は避けてください。");
});

try {
  const handoff = readPlayerHandoff(location.hash);
  if (!handoff) throw new Error("再生リンクがありません。PWAの履歴からルームを開いてください。");
  void loadStream(handoff).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "再生に失敗しました。", true);
  });
} catch (error) {
  setStatus(error instanceof Error ? error.message : "再生リンクを読み取れませんでした。", true);
}
