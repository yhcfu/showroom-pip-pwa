import "./style.css";
import { parseRoomHistory, setRoomPinned, upsertRoomHistory, type RoomHistoryEntry } from "./history";
import { detectPlatform } from "./platform";
import { buildPlayerUrl, buildRoomPlayerUrl, parseRoomKey, readPlayerHandoff } from "./showroom";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const HISTORY_KEY = "showroom-pip-history-v1";
const roomForm = document.querySelector<HTMLFormElement>("#room-form")!;
const hlsForm = document.querySelector<HTMLFormElement>("#hls-form")!;
const roomInput = document.querySelector<HTMLInputElement>("#room")!;
const hlsInput = document.querySelector<HTMLInputElement>("#hls-url")!;
const historyContainer = document.querySelector<HTMLElement>("#room-history")!;
const installGuide = document.querySelector<HTMLElement>("#install-guide")!;
const installTitle = document.querySelector<HTMLElement>("#install-title")!;
const installSummary = document.querySelector<HTMLElement>("#install-summary")!;
const installButton = document.querySelector<HTMLButtonElement>("#install-button")!;
const installSteps = document.querySelector<HTMLOListElement>("#install-steps")!;
const status = document.querySelector<HTMLElement>("#status")!;

const platform = detectPlatform(navigator);
const isStandalone = matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
const appBase = new URL(`${import.meta.env.BASE_URL}app/`, location.origin);
const playerBase = new URL(`${import.meta.env.BASE_URL}player/`, location.origin);
let historyEntries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
let installPrompt: InstallPromptEvent | undefined;

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle("error", isError);
}

function persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
  renderHistory();
}

function refreshHistory() {
  historyEntries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
  renderHistory();
}

function rememberRoom(roomKey: string, room?: Partial<RoomHistoryEntry>) {
  historyEntries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
  historyEntries = upsertRoomHistory(historyEntries, {
    roomKey,
    lastOpenedAt: Date.now(),
    ...room,
  });
  persistHistory();
}

function selectRoom(roomKey: string) {
  roomInput.value = roomKey;
}

function openRoom(roomKey: string) {
  selectRoom(roomKey);
  rememberRoom(roomKey);
  location.href = buildRoomPlayerUrl(roomKey, playerBase.toString());
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
    const roomLabel = room.roomName || room.roomKey;
    const row = document.createElement("div");
    row.className = "room-row";

    const label = document.createElement("div");
    label.className = "room-label";
    const name = document.createElement("div");
    name.className = "room-name";
    name.textContent = roomLabel;
    const key = document.createElement("div");
    key.className = "room-key";
    key.textContent = `${room.roomName ? room.roomKey : ""}${room.roomId ? `  #${room.roomId}` : ""}`.trim();
    label.append(name);
    if (key.textContent) label.append(key);

    const actions = document.createElement("div");
    actions.className = "room-row-actions";

    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "room-pin";
    pin.textContent = "📌";
    pin.title = room.pinnedAt === undefined ? "固定" : "固定を解除";
    pin.setAttribute("aria-label", `${roomLabel}の${pin.title}`);
    pin.setAttribute("aria-pressed", String(room.pinnedAt !== undefined));
    pin.addEventListener("click", () => {
      historyEntries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
      historyEntries = setRoomPinned(historyEntries, room, room.pinnedAt === undefined);
      persistHistory();
    });
    actions.append(pin);

    const open = document.createElement("button");
    open.type = "button";
    open.className = "room-open";
    open.textContent = "▶";
    open.setAttribute("aria-label", `${roomLabel}を見る`);
    open.addEventListener("click", () => openRoom(room.roomKey));
    actions.append(open);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "room-remove";
    remove.title = "履歴から削除";
    remove.setAttribute("aria-label", `${roomLabel}を履歴から削除`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      historyEntries = parseRoomHistory(localStorage.getItem(HISTORY_KEY));
      historyEntries = historyEntries.filter((entry) =>
        entry.roomId !== undefined && room.roomId !== undefined
          ? entry.roomId !== room.roomId
          : entry.roomKey !== room.roomKey
      );
      persistHistory();
    });

    row.append(label, actions, remove);
    historyContainer.append(row);
  }
}

function setupInstallGuide() {
  if (isStandalone) return;
  if (platform === "ios") {
    installGuide.hidden = false;
    installButton.addEventListener("click", () => {
      installSteps.hidden = !installSteps.hidden;
      installButton.textContent = installSteps.hidden ? "手順" : "閉じる";
    });
    return;
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    installGuide.hidden = false;
    installTitle.textContent = "アプリとしてインストール";
    installSummary.textContent = "履歴をホーム画面からすぐ開けます。";
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

roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    openRoom(parseRoomKey(roomInput.value));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "ルームを読み取れませんでした。", true);
  }
});

hlsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    location.href = buildPlayerUrl(hlsInput.value.trim(), playerBase.toString());
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "HLS URLを読み取れませんでした。", true);
  }
});

setupInstallGuide();
renderHistory();
window.addEventListener("storage", (event) => {
  if (event.key === HISTORY_KEY) refreshHistory();
});
window.addEventListener("pageshow", refreshHistory);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshHistory();
});

try {
  const handoff = readPlayerHandoff(location.hash);
  if (handoff) {
    if (handoff.roomKey) {
      rememberRoom(handoff.roomKey, {
        roomId: handoff.roomId,
        roomName: handoff.roomName,
      });
    }
    location.replace(buildPlayerUrl(handoff.streamUrl, playerBase.toString(), handoff));
  } else {
    const requestedRoom = new URLSearchParams(location.search).get("room");
    if (requestedRoom) {
      const roomKey = parseRoomKey(requestedRoom);
      selectRoom(roomKey);
      rememberRoom(roomKey);
    }
  }
} catch (error) {
  setStatus(error instanceof Error ? error.message : "再生リンクを読み取れませんでした。", true);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("sw.js", appBase);
    void navigator.serviceWorker.register(serviceWorkerUrl.pathname, { scope: appBase.pathname });
  });
}
