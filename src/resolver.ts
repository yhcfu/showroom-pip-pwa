import type { PlayerHandoff } from "./showroom";

type ResolverPayload = {
  roomKey?: unknown;
  roomId?: unknown;
  roomName?: unknown;
  streamUrl?: unknown;
  error?: unknown;
};

export async function resolveRoom(
  roomKey: string,
  resolverUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<PlayerHandoff> {
  if (!resolverUrl) throw new Error("Player Resolverが設定されていません。");
  const base = new URL(resolverUrl);
  const url = base.pathname === "/" ? new URL("api/resolve", base) : base;
  url.searchParams.set("room", roomKey);

  const response = await fetcher(url, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => null) as ResolverPayload | null;
  if (!response.ok) {
    if (response.status === 409) throw new Error("現在は配信中ではありません。");
    throw new Error(typeof payload?.error === "string" ? payload.error : "配信情報を取得できませんでした。");
  }

  if (
    typeof payload?.streamUrl !== "string" ||
    typeof payload.roomKey !== "string" ||
    typeof payload.roomId !== "number"
  ) {
    throw new Error("Resolverから不正な応答を受け取りました。");
  }

  const streamUrl = new URL(payload.streamUrl);
  if (streamUrl.protocol !== "https:" || !streamUrl.pathname.endsWith(".m3u8")) {
    throw new Error("Resolverから有効な配信URLを受け取れませんでした。");
  }

  return {
    streamUrl: streamUrl.toString(),
    roomKey: payload.roomKey,
    roomId: payload.roomId,
    roomName: typeof payload.roomName === "string" ? payload.roomName : undefined,
  };
}
