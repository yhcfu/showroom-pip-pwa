import "./style.css";
import {
  mergeRoomStatus,
  parseRoomHistory,
  upsertRoomHistory,
  type RoomHistoryEntry,
} from "./history";
import {
  buildPlayerUrl,
  buildShortcutUrl,
  parseRoomKey,
  readPlayerHandoff,
  type PlayerHandoff,
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
  roomName?: string;
  streamUrl: string;
  error?: string;
  message?: string;
};

type RoomStatusResponse = {
  rooms: Array<{
    roomKey: string;
    roomId?: number;
    roomName?: string;
    isLive?: boolean;
    error?: string;
  }>;
  checkedAt: number;
  error?: string;
  message?: string;
};

type PeriodicSyncManager = {
  register(tag: string, options: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
};

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const HISTORY_KEY = "showroom-pip-history-v1";
const POLLING_KEY = "showroom-pip-polling";
const WATCH_TOKEN_KEY = "showroom-pip-watch-token";
const POLL_INTERVAL = 60_000;
const PERIODIC_SYNC_INTERVAL = 15 * 60_000;

const video = document.querySelector<HTMLVideoElement>("#video")!;
const roomForm = document.querySelector<HTMLFormElement>("#room-form")!;
const hlsForm = document.querySelector<HTMLFormElement>("#hls-form")!;
const roomInput = document.querySelector<HTMLInputElement>("#room")!;
const hlsInput = document.querySelector<HTMLInputElement>("#hls-url")!;
const resolverInput = document.querySelector<HTMLInputElement>("#resolver")!;
const watchTokenInput = document.querySelector<HTMLInputElement>("#watch-token")!;
const shortcutButton = document.querySelector<HTMLAnchorElement>("#shortcut-button")!;
const pipButton = document.querySelector<HTMLButtonElement>("#pip-button")!;
const copyButton = document.querySelector<HTMLButtonElement>("#copy-player-url")!;
const watchToggle = document.querySelector<HTMLButtonElement>("#watch-toggle")!;
const notificationButton = document.querySelector<HTMLButtonElement>("#notification-button")!;
const watchCapability = document.querySelector<HTMLElement>("#watch-capability")!;
const historyContainer = document.querySelector<HTMLElement>("#room-history")!;
const installGuide = document.querySelector<HTMLElement>("#install-guide")!;
const installTitle = document.querySelector<HTMLElement>("#install-title")!;
const installSummary = document.querySelector<HTMLElement>("#install-summary")!;
const installButton = document.querySelector<HTMLButtonElement>("#install-button")!;
const installSteps = document.querySelector<HTMLOListElement>("#install-steps")!;
const status = document.querySelector<HTMLElement>("#status")!;
const emptyState = document.querySelector<HTMLElement>("#empty-state")!;
const platformNote = document.querySelector<HTMLElement>("#platform-note")!;

const isStandalone = matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const defaultResolver = import.meta.env.VITE_RESOLVER_URL || "";
resolverInput.value = localStorage.getItem("showroom-pip-resolver") || defaultResolver;
watchTokenInput.value = localStorage.getItem(WATCH_TOKEN_KEY) || "";

let historyEntries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
let pollingEnabled = localStorage.getItem(POLLING_KEY) === "true";
let pollTimer: number | undefined;
let pollInFlight = false;
let installPrompt: InstallPromptEvent | undefined;
let hls: import("hls.js").default | null = null;
let activeStreamUrl = "";
let activeRoom: Omit<PlayerHandoff, "streamUrl"> | undefined;

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function saveResolver() {
  const value = resolverInput.value.trim().replace(/\/$/, "");
  resolverInput.value = value;
  if (value) localStorage.setItem("showroom-pip-resolver", value);
  else localStorage.removeItem("showroom-pip-resolver");
  void syncWatchConfig();
  return value;
}

function persistHistory(syncRemote = true) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
  renderHistory();
  if (syncRemote) void syncWatchConfig();
}

function rememberRoom(roomKey: string, room?: Partial<RoomHistoryEntry>) {
  historyEntries = upsertRoomHistory(historyEntries, {
    roomKey,
    lastOpenedAt: Date.now(),
    ...room,
  });
  persistHistory();
}

function renderHistory() {
  historyContainer.replaceChildren();
  if (historyEntries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "まだ履歴はありません。";
    historyContainer.append(empty);
    return;
  }

  for (const room of historyEntries) {
    const row = document.createElement("div");
    row.className = "room-row";

    const liveDot = document.createElement("span");
    liveDot.className = `live-dot${room.isLive ? " live" : ""}`;
    liveDot.title = room.isLive === undefined ? "未確認" : room.isLive ? "配信中" : "配信していません";

    const label = document.createElement("div");
    label.className = "room-label";
    const name = document.createElement("div");
    name.className = "room-name";
    name.textContent = room.roomName || room.roomKey;
    const key = document.createElement("div");
    key.className = "room-key";
    key.textContent = `${room.roomName ? room.roomKey : ""}${room.roomId ? `  #${room.roomId}` : ""}`.trim();
    label.append(name);
    if (key.textContent) label.append(key);

    const open = document.createElement("button");
    open.type = "button";
    open.className = `room-open${room.isLive ? " live" : ""}`;
    open.textContent = room.isLive ? "再生" : "開く";
    open.addEventListener("click", () => void openRoom(room.roomKey));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "room-remove";
    remove.title = "履歴から削除";
    remove.setAttribute("aria-label", `${room.roomName || room.roomKey}を履歴から削除`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      historyEntries = historyEntries.filter((entry) => entry !== room);
      persistHistory();
    });

    row.append(liveDot, label, open, remove);
    historyContainer.append(row);
  }
}

async function loadStream(streamUrl: string, room?: Omit<PlayerHandoff, "streamUrl">) {
  const parsed = new URL(streamUrl);
  if (parsed.protocol !== "https:" || !parsed.pathname.endsWith(".m3u8")) {
    throw new Error("HTTPSの.m3u8 URLだけ再生できます。");
  }

  hls?.destroy();
  hls = null;
  activeStreamUrl = parsed.toString();
  activeRoom = room;
  emptyState.hidden = true;
  copyButton.disabled = false;

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = activeStreamUrl;
  } else {
    const { default: Hls } = await import("hls.js/light");
    if (!Hls.isSupported()) throw new Error("このブラウザはHLS再生に対応していません。");
    const instance = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
    hls = instance;
    instance.loadSource(activeStreamUrl);
    instance.attachMedia(video);
    instance.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setStatus(`HLS再生エラー: ${data.details}`, true);
    });
  }

  pipButton.disabled = false;
  window.history.replaceState(null, "", buildPlayerUrl(activeStreamUrl, location.href, room));
  setStatus("配信を読み込みました。再生後にPiPを押してください。");
  try {
    await video.play();
  } catch {
    setStatus("配信を読み込みました。再生ボタンを押してください。");
  }
}

async function resolveRoom(roomKey: string) {
  const resolver = saveResolver();
  if (!resolver) throw new Error("自動取得にはResolver URLが必要です。iPhoneではショートカットも利用できます。");

  setStatus("公開配信URLを取得しています…");
  const response = await fetch(`${resolver}/resolve?room=${encodeURIComponent(roomKey)}`);
  const body = (await response.json()) as ResolveResponse;
  if (!response.ok) throw new Error(body.message || body.error || `Resolver error (${response.status})`);

  rememberRoom(body.roomKey, {
    roomId: body.roomId,
    roomName: body.roomName,
    isLive: true,
    lastCheckedAt: Date.now(),
  });
  await loadStream(body.streamUrl, body);
}

async function openRoom(roomKey: string) {
  roomInput.value = roomKey;
  shortcutButton.href = buildShortcutUrl(roomKey);
  rememberRoom(roomKey);
  try {
    if (resolverInput.value.trim()) {
      await resolveRoom(roomKey);
      return;
    }
    if (isIOS) {
      location.href = buildShortcutUrl(roomKey);
      return;
    }
    throw new Error("履歴から自動取得するにはResolverを設定してください。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "配信URLの取得に失敗しました。", true);
  }
}

async function showLiveNotification(room: RoomHistoryEntry) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const target = new URL(location.href);
  target.search = new URLSearchParams({ room: room.roomKey }).toString();
  target.hash = "";
  await registration.showNotification(`${room.roomName || room.roomKey} が配信を開始しました`, {
    body: "タップしてプレイヤーを開く",
    icon: `${import.meta.env.BASE_URL}icon.svg`,
    tag: `showroom-live-${room.roomId || room.roomKey}`,
    data: { url: target.toString() },
  });
}

async function pollRooms(notify = true) {
  if (pollInFlight || historyEntries.length === 0) return;
  const resolver = resolverInput.value.trim().replace(/\/$/, "");
  if (!resolver) {
    setStatus("配信検知にはResolver URLが必要です。", true);
    return;
  }

  pollInFlight = true;
  try {
    const roomKeys = historyEntries.slice(0, 20).map((room) => room.roomKey);
    const url = new URL(`${resolver}/status`);
    url.searchParams.set("rooms", roomKeys.join(","));
    const response = await fetch(url);
    const body = (await response.json()) as RoomStatusResponse;
    if (!response.ok) throw new Error(body.message || body.error || `Resolver error (${response.status})`);

    const newlyLive: RoomHistoryEntry[] = [];
    for (const roomStatus of body.rooms) {
      if (roomStatus.error || roomStatus.isLive === undefined) continue;
      const previous = historyEntries.find((room) =>
        roomStatus.roomId !== undefined && room.roomId !== undefined
          ? room.roomId === roomStatus.roomId
          : room.roomKey === roomStatus.roomKey
      );
      historyEntries = mergeRoomStatus(historyEntries, {
        roomKey: roomStatus.roomKey,
        roomId: roomStatus.roomId,
        roomName: roomStatus.roomName,
        isLive: roomStatus.isLive,
        lastCheckedAt: body.checkedAt,
      });
      const updated = historyEntries.find((room) =>
        roomStatus.roomId !== undefined && room.roomId !== undefined
          ? room.roomId === roomStatus.roomId
          : room.roomKey === roomStatus.roomKey
      );
      if (roomStatus.isLive && previous?.isLive !== true && updated) newlyLive.push(updated);
    }
    persistHistory(false);
    if (notify) await Promise.all(newlyLive.map(showLiveNotification));
    setStatus(`履歴${body.rooms.length}件を確認しました。${newlyLive.length ? `${newlyLive.length}件が配信開始` : "新しい配信はありません"}。`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "配信状況の確認に失敗しました。", true);
  } finally {
    pollInFlight = false;
  }
}

function refreshPollingTimer() {
  if (pollTimer !== undefined) window.clearInterval(pollTimer);
  pollTimer = undefined;
  watchToggle.classList.toggle("active", pollingEnabled);
  watchToggle.textContent = `配信検知 ${pollingEnabled ? "ON" : "OFF"}`;
  if (pollingEnabled) {
    void pollRooms();
    pollTimer = window.setInterval(() => void pollRooms(), POLL_INTERVAL);
  }
}

async function syncWatchConfig() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const resolver = resolverInput.value.trim().replace(/\/$/, "");
  registration.active?.postMessage({
    type: "watch-config",
    enabled: pollingEnabled,
    resolver,
    rooms: historyEntries.slice(0, 20).map(({ roomKey, roomId, roomName, isLive }) => ({ roomKey, roomId, roomName, isLive })),
  });

  const pushEnabled = await syncPushSubscription(false).catch(() => false);
  if (pushEnabled) {
    watchCapability.textContent = "60秒ごとに確認。PWAを閉じた後はWorkerから配信開始を通知します。";
  }

  const periodicSync = (registration as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync;
  if (!periodicSync) {
    if (!pushEnabled) watchCapability.textContent = "この端末ではPWAを開いている間だけ60秒ごとに確認します。";
    return;
  }
  try {
    const notificationsGranted = "Notification" in window && Notification.permission === "granted";
    if (pollingEnabled && resolver && notificationsGranted) {
      await periodicSync.register("showroom-watch", { minInterval: PERIODIC_SYNC_INTERVAL });
      if (!pushEnabled) watchCapability.textContent = "60秒ごとに確認。対応状況に応じてバックグラウンド確認も試みます。";
    } else {
      await periodicSync.unregister("showroom-watch");
      if (!pushEnabled) watchCapability.textContent = "PWAを開いている間、60秒ごとに確認します。";
    }
  } catch {
    if (!pushEnabled) watchCapability.textContent = "PWAを開いている間、60秒ごとに確認します。";
  }
}

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = Uint8Array.from(atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")), (character) =>
    character.charCodeAt(0)
  );
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function syncPushSubscription(create: boolean): Promise<boolean> {
  const resolver = resolverInput.value.trim().replace(/\/$/, "");
  const token = watchTokenInput.value.trim();
  if (!resolver || !token || !("PushManager" in window) ||
      !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && create) {
    const keyResponse = await fetch(`${resolver}/push/public-key`);
    const keyBody = await keyResponse.json() as { publicKey?: string; error?: string };
    if (!keyResponse.ok || !keyBody.publicKey) {
      throw new Error(keyBody.error || "WorkerにWeb Pushが設定されていません。");
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(keyBody.publicKey),
    });
  }
  if (!subscription) return false;

  const response = await fetch(`${resolver}/push/subscription`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      rooms: pollingEnabled
        ? historyEntries.slice(0, 20).map(({ roomKey, roomId, roomName }) => ({ roomKey, roomId, roomName }))
        : [],
      playerUrl: new URL(import.meta.env.BASE_URL, location.origin).toString(),
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.message || body.error || `Push registration error (${response.status})`);
  }
  return pollingEnabled;
}

async function deleteServerPushSubscription(token: string): Promise<void> {
  const resolver = resolverInput.value.trim().replace(/\/$/, "");
  if (!resolver) throw new Error("Resolver URL is required to remove Web Push");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await fetch(`${resolver}/push/subscription`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error(`Push registration delete error (${response.status})`);
}

function setupInstallGuide() {
  if (isStandalone) return;
  if (isIOS) {
    installGuide.hidden = false;
    installButton.addEventListener("click", () => {
      installSteps.hidden = !installSteps.hidden;
      installButton.textContent = installSteps.hidden ? "追加手順を見る" : "手順を閉じる";
    });
    return;
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    installGuide.hidden = false;
    installTitle.textContent = "アプリとしてインストール";
    installSummary.textContent = "履歴と通知を使いやすくするため、この端末へ追加できます。";
    installButton.textContent = "インストール";
    installButton.addEventListener("click", async () => {
      if (!installPrompt) return;
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") installGuide.hidden = true;
      installPrompt = undefined;
    }, { once: true });
  });
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
    const roomKey = parseRoomKey(roomInput.value);
    rememberRoom(roomKey);
    shortcutButton.href = buildShortcutUrl(roomKey);
  } catch (error) {
    event.preventDefault();
    setStatus(error instanceof Error ? error.message : "ルームを読み取れませんでした。", true);
  }
});

resolverInput.addEventListener("change", saveResolver);

watchTokenInput.addEventListener("change", async () => {
  const previous = localStorage.getItem(WATCH_TOKEN_KEY) || "";
  const value = watchTokenInput.value.trim();
  watchTokenInput.value = value;
  if (!value && previous) {
    try {
      await deleteServerPushSubscription(previous);
    } catch {
      watchTokenInput.value = previous;
      setStatus("Worker側の通知解除に失敗しました。通信を確認して、もう一度Tokenを消してください。", true);
      return;
    }
  }
  if (value) localStorage.setItem(WATCH_TOKEN_KEY, value);
  else localStorage.removeItem(WATCH_TOKEN_KEY);
  await syncWatchConfig();
});

roomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roomKey = parseRoomKey(roomInput.value);
    rememberRoom(roomKey);
    await resolveRoom(roomKey);
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
  await navigator.clipboard.writeText(buildPlayerUrl(activeStreamUrl, location.href, activeRoom));
  setStatus("再生リンクをコピーしました。HLS URLを含むため共有は避けてください。");
});

watchToggle.addEventListener("click", () => {
  pollingEnabled = !pollingEnabled;
  localStorage.setItem(POLLING_KEY, String(pollingEnabled));
  refreshPollingTimer();
  void syncWatchConfig();
});

notificationButton.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    setStatus("このブラウザはWeb通知に対応していません。", true);
    return;
  }
  if (isIOS && !isStandalone) {
    installGuide.hidden = false;
    installSteps.hidden = false;
    installGuide.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("iPhoneでは先にホーム画面へ追加し、追加したアイコンから開いてください。", true);
    return;
  }
  const permission = await Notification.requestPermission();
  notificationButton.classList.toggle("active", permission === "granted");
  notificationButton.textContent = permission === "granted" ? "通知 ON" : "通知を許可";
  if (permission !== "granted") {
    setStatus("通知は許可されませんでした。", true);
    await syncWatchConfig();
    return;
  }
  try {
    const pushEnabled = await syncPushSubscription(true);
    setStatus(pushEnabled
      ? "バックグラウンドの配信開始通知を有効にしました。"
      : "通知を有効にしました。バックグラウンド通知には配信検知ON、Resolver、Tokenが必要です。"
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Web Pushの登録に失敗しました。", true);
  }
  await syncWatchConfig();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && pollingEnabled) void pollRooms();
});

if (isIOS && isStandalone) {
  platformNote.hidden = false;
  platformNote.innerHTML = "<strong>iPhoneのインストール済みPWAではPiPが動かないWebKit既知問題があります。</strong> ショートカット経由で通常のSafariに開いてください。";
}

if ("Notification" in window && Notification.permission === "granted") {
  notificationButton.classList.add("active");
  notificationButton.textContent = "通知 ON";
}

setupInstallGuide();
renderHistory();
refreshPollingTimer();

try {
  const handoff = readPlayerHandoff(location.hash);
  if (handoff) {
    if (handoff.roomKey) {
      rememberRoom(handoff.roomKey, {
        roomId: handoff.roomId,
        roomName: handoff.roomName,
        isLive: true,
        lastCheckedAt: Date.now(),
      });
    }
    void loadStream(handoff.streamUrl, handoff);
  } else {
    const requestedRoom = new URLSearchParams(location.search).get("room");
    if (requestedRoom) {
      const roomKey = parseRoomKey(requestedRoom);
      roomInput.value = roomKey;
      rememberRoom(roomKey);
      if (resolverInput.value.trim()) void resolveRoom(roomKey).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "配信URLの取得に失敗しました。", true);
      });
    }
  }
} catch (error) {
  setStatus(error instanceof Error ? error.message : "再生リンクを読み取れませんでした。", true);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(() => syncWatchConfig());
  });
}
