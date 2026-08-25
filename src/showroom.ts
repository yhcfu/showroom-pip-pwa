const ROOM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function parseRoomKey(input: string): string {
  const value = input.trim();
  if (ROOM_KEY_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SHOWROOMのルームURLまたはroom_url_keyを入力してください。");
  }

  if (!["showroom-live.com", "www.showroom-live.com"].includes(url.hostname)) {
    throw new Error("showroom-live.com のURLだけ指定できます。");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const key = segments[0] === "r" ? segments[1] : undefined;
  if (!key || !ROOM_KEY_PATTERN.test(key)) {
    throw new Error("URLからroom_url_keyを読み取れませんでした。");
  }
  return key;
}

export const IOS_SHORTCUT_NAME = "SHOWROOM-PiP";

export function buildShortcutUrl(room: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(IOS_SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(room.trim())}`;
}

export type PlayerHandoff = {
  streamUrl: string;
  roomKey?: string;
  roomId?: number;
  roomName?: string;
};

export function buildPlayerUrl(streamUrl: string, currentUrl: string, room?: Omit<PlayerHandoff, "streamUrl">): string {
  const url = new URL(currentUrl);
  url.search = "";
  const fragment = new URLSearchParams({ v: "1", status: "ok", stream: streamUrl });
  if (room?.roomKey) fragment.set("room", room.roomKey);
  if (room?.roomId !== undefined) fragment.set("room_id", String(room.roomId));
  if (room?.roomName) fragment.set("room_name", room.roomName);
  url.hash = fragment.toString();
  return url.toString();
}

export function readPlayerHandoff(hash: string): PlayerHandoff | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("stream");
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.pathname.endsWith(".m3u8")) {
    throw new Error("再生リンクに有効なHTTPS HLS URLがありません。");
  }
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const roomIdValue = fragment.get("room_id");
  const roomId = roomIdValue === null ? undefined : Number(roomIdValue);
  return {
    streamUrl: url.toString(),
    roomKey: fragment.get("room") || undefined,
    roomId: roomId !== undefined && Number.isSafeInteger(roomId) && roomId > 0 ? roomId : undefined,
    roomName: fragment.get("room_name") || undefined,
  };
}

export function readStreamFromHash(hash: string): string | null {
  return readPlayerHandoff(hash)?.streamUrl || null;
}
