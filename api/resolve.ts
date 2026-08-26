import type { IncomingMessage, ServerResponse } from "node:http";

const ROOM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

type Fetcher = typeof fetch;

type StatusPayload = {
  is_live?: boolean;
  room_id?: number;
  room_name?: string;
};

type StreamingPayload = {
  streaming_url_list?: Array<StreamingUrl>;
};

type StreamingUrl = {
  type?: string;
  url?: string;
  label?: string;
  quality?: number;
};

export type ResolvedShowroomRoom = {
  roomKey: string;
  roomId: number;
  roomName?: string;
  streamUrl: string;
};

export class ResolverError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

async function readJson<T>(url: URL, fetcher: Fetcher, signal: AbortSignal): Promise<T> {
  const response = await fetcher(url, {
    headers: {
      accept: "application/json",
      "user-agent": "showroom-pip-pwa-resolver/1.0",
    },
    signal,
  });
  if (!response.ok) throw new ResolverError("SHOWROOMから配信情報を取得できませんでした。", 502, "upstream_error");
  return response.json() as Promise<T>;
}

export function selectHighestQualityHls(streams: StreamingUrl[]): StreamingUrl | undefined {
  const fixedHls = streams.filter((stream) => stream.type === "hls" && typeof stream.url === "string");
  if (fixedHls.length > 0) {
    return fixedHls.reduce((best, stream) => {
      const original = stream.label?.toLowerCase().includes("original") ? 1 : 0;
      const bestOriginal = best.label?.toLowerCase().includes("original") ? 1 : 0;
      if (original !== bestOriginal) return original > bestOriginal ? stream : best;
      return (stream.quality ?? 0) > (best.quality ?? 0) ? stream : best;
    });
  }
  return streams.find((stream) => stream.type === "hls_all" && typeof stream.url === "string");
}

export async function resolveShowroomRoom(
  input: string,
  fetcher: Fetcher = fetch,
): Promise<ResolvedShowroomRoom> {
  const roomKey = input.trim();
  if (!ROOM_KEY_PATTERN.test(roomKey)) {
    throw new ResolverError("ルームURLまたはroom keyが不正です。", 400, "invalid_room");
  }

  const signal = AbortSignal.timeout(8_000);
  const statusUrl = new URL("https://www.showroom-live.com/api/room/status");
  statusUrl.searchParams.set("room_url_key", roomKey);
  const status = await readJson<StatusPayload>(statusUrl, fetcher, signal);
  if (!status.is_live) throw new ResolverError("現在は配信中ではありません。", 409, "not_live");
  if (!Number.isSafeInteger(status.room_id) || (status.room_id ?? 0) <= 0) {
    throw new ResolverError("SHOWROOMからルーム情報を取得できませんでした。", 502, "invalid_upstream_response");
  }

  const streamUrl = new URL("https://www.showroom-live.com/api/live/streaming_url");
  streamUrl.searchParams.set("abr_available", "1");
  streamUrl.searchParams.set("room_id", String(status.room_id));
  const streams = await readJson<StreamingPayload>(streamUrl, fetcher, signal);
  const selected = selectHighestQualityHls(streams.streaming_url_list ?? []);

  if (typeof selected?.url !== "string") {
    throw new ResolverError("公開HLSが見つかりませんでした。", 502, "stream_not_found");
  }
  const hlsUrl = new URL(selected.url);
  if (hlsUrl.protocol !== "https:" || !hlsUrl.pathname.endsWith(".m3u8")) {
    throw new ResolverError("SHOWROOMから不正な配信URLを受け取りました。", 502, "invalid_stream_url");
  }

  return {
    roomKey,
    roomId: status.room_id!,
    roomName: typeof status.room_name === "string" ? status.room_name : undefined,
    streamUrl: hlsUrl.toString(),
  };
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://yhcfu.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function allowedOrigins(): Set<string> {
  const configured = process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function responseHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Accept",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
  };
}

function sendJson(response: ServerResponse, origin: string, body: unknown, status = 200): void {
  response.statusCode = status;
  for (const [name, value] of Object.entries(responseHeaders(origin))) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const originHeader = request.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!origin || !allowedOrigins().has(origin)) {
    response.statusCode = 403;
    response.setHeader("vary", "Origin");
    response.end("Forbidden");
    return;
  }
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    for (const [name, value] of Object.entries(responseHeaders(origin))) response.setHeader(name, value);
    response.end();
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, origin, { error: "method_not_allowed" }, 405);
    return;
  }

  const room = new URL(request.url || "/", "https://resolver.invalid").searchParams.get("room");
  if (!room) {
    sendJson(response, origin, { error: "room_required" }, 400);
    return;
  }

  try {
    sendJson(response, origin, await resolveShowroomRoom(room));
  } catch (error) {
    if (error instanceof ResolverError) sendJson(response, origin, { error: error.message, code: error.code }, error.status);
    else sendJson(response, origin, { error: "配信情報の取得中にエラーが発生しました。", code: "internal_error" }, 502);
  }
}
