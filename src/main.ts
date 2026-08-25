import "./style.css";
import {
  buildPlayerUrl,
  buildShortcutUrl,
  parseRoomKey,
  readStreamFromHash,
} from "./showroom";

declare global {
  interface HTMLVideoElement {
    webkitSupportsPresentationMode?: (mode: string) => boolean;
    webkitSetPresentationMode?: (mode: string) => void;
    webkitPresentationMode?: string;
  }
}

type ResolveResponse = {
  roomKey: string;
  roomId: number;
  streamUrl: string;
  error?: string;
  message?: string;
};

const video = document.querySelector<HTMLVideoElement>("#video")!;
const roomForm = document.querySelector<HTMLFormElement>("#room-form")!;
const hlsForm = document.querySelector<HTMLFormElement>("#hls-form")!;
const roomInput = document.querySelector<HTMLInputElement>("#room")!;
const hlsInput = document.querySelector<HTMLInputElement>("#hls-url")!;
const resolverInput = document.querySelector<HTMLInputElement>("#resolver")!;
const shortcutButton = document.querySelector<HTMLAnchorElement>("#shortcut-button")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy-player-url")!;
const status = document.querySelector<HTMLElement>("#status")!;
const emptyState = document.querySelector<HTMLElement>("#empty-state")!;
const platformNote = document.querySelector<HTMLElement>("#platform-note")!;

const defaultResolver = import.meta.env.VITE_RESOLVER_URL || "";
resolverInput.value = localStorage.getItem("showroom-pip-resolver") || defaultResolver;
let hls: import("hls.js").default | null = null;
let activeStreamUrl = "";

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function saveResolver() {
  const value = resolverInput.value.trim().replace(/\/$/, "");
  resolverInput.value = value;
  if (value) localStorage.setItem("showroom-pip-resolver", value);
  else localStorage.removeItem("showroom-pip-resolver");
  return value;
}

async function loadStream(streamUrl: string) {
  const parsed = new URL(streamUrl);
  if (parsed.protocol !== "https:" || !parsed.pathname.endsWith(".m3u8")) {
    throw new Error("HTTPSの.m3u8 URLだけ再生できます。");
  }

  hls?.destroy();
  hls = null;
  activeStreamUrl = parsed.toString();
  emptyState.hidden = true;
  copyButton.disabled = false;

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = activeStreamUrl;
  } else {
    const { default: Hls } = await import("hls.js/light");
    if (!Hls.isSupported()) {
      throw new Error("このブラウザはHLS再生に対応していません。");
    }
    const instance = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
    hls = instance;
    instance.loadSource(activeStreamUrl);
    instance.attachMedia(video);
    instance.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setStatus(`HLS再生エラー: ${data.details}`, true);
    });
  }

  pipButton.disabled = false;
  history.replaceState(null, "", buildPlayerUrl(activeStreamUrl, location.href));
  setStatus("配信を読み込みました。再生後にPiPを押してください。");
  try {
    await video.play();
  } catch {
    setStatus("配信を読み込みました。再生ボタンを押してください。");
  }
}

roomInput.addEventListener("input", () => {
  try {
    shortcutButton.href = buildShortcutUrl(parseRoomKey(roomInput.value));
  } catch {
    shortcutButton.href = buildShortcutUrl(roomInput.value);
  }
});

shortcutButton.addEventListener("click", (event) => {
  try {
    shortcutButton.href = buildShortcutUrl(parseRoomKey(roomInput.value));
  } catch (error) {
    event.preventDefault();
    setStatus(error instanceof Error ? error.message : "ルームを読み取れませんでした。", true);
  }
});

resolverInput.addEventListener("change", saveResolver);

roomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roomKey = parseRoomKey(roomInput.value);
    const resolver = saveResolver();
    if (!resolver) {
      throw new Error("Resolver URLを設定するか、iPhoneショートカットを使用してください。");
    }
    setStatus("公開配信URLを取得しています…");
    const response = await fetch(`${resolver}/resolve?room=${encodeURIComponent(roomKey)}`);
    const body = (await response.json()) as ResolveResponse;
    if (!response.ok) throw new Error(body.message || body.error || `Resolver error (${response.status})`);
    await loadStream(body.streamUrl);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "配信URLの取得に失敗しました。", true);
  }
});

hlsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadStream(hlsInput.value.trim());
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "再生に失敗しました。", true);
  }
});

pipButton.addEventListener("click", async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
      await video.requestPictureInPicture();
      return;
    }
    if (video.webkitSupportsPresentationMode?.("picture-in-picture")) {
      video.webkitSetPresentationMode?.("picture-in-picture");
      return;
    }
    throw new Error("この表示モードではPiPを開始できません。iPhoneはSafariで開いてください。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "PiPを開始できませんでした。", true);
  }
});

copyButton.addEventListener("click", async () => {
  if (!activeStreamUrl) return;
  await navigator.clipboard.writeText(buildPlayerUrl(activeStreamUrl, location.href));
  setStatus("再生リンクをコピーしました。HLS URLを含むため共有は避けてください。");
});

const isStandalone = matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

if (isIOS && isStandalone) {
  platformNote.hidden = false;
  platformNote.innerHTML = "<strong>iPhoneのインストール済みPWAではPiPが動かないWebKit既知問題があります。</strong> ショートカット経由で通常のSafariに開いてください。";
}

try {
  const stream = readStreamFromHash(location.hash);
  if (stream) void loadStream(stream);
} catch (error) {
  setStatus(error instanceof Error ? error.message : "再生リンクを読み取れませんでした。", true);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
