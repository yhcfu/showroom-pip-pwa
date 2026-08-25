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

export function buildShortcutUrl(room: string): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent("SHOWROOM PiP")}&input=text&text=${encodeURIComponent(room.trim())}`;
}

export function buildPlayerUrl(streamUrl: string, currentUrl: string): string {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = new URLSearchParams({ stream: streamUrl }).toString();
  return url.toString();
}

export function readStreamFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("stream");
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.pathname.endsWith(".m3u8")) {
    throw new Error("再生リンクに有効なHTTPS HLS URLがありません。");
  }
  return url.toString();
}
