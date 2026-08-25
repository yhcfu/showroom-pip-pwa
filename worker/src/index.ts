export interface Env {
  ALLOWED_ORIGINS: string;
}

type Stream = {
  type?: string;
  url?: string;
};

const ROOM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const SHOWROOM_ORIGIN = "https://www.showroom-live.com";

export function parseRoomKey(input: string): string {
  const value = input.trim();
  if (ROOM_KEY_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ResolverError(400, "invalid_room", "SHOWROOM room URL or room_url_key is required");
  }

  if (!["showroom-live.com", "www.showroom-live.com"].includes(url.hostname)) {
    throw new ResolverError(400, "invalid_room", "Only showroom-live.com URLs are accepted");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const key = segments[0] === "r" ? segments[1] : undefined;
  if (!key || !ROOM_KEY_PATTERN.test(key)) {
    throw new ResolverError(400, "invalid_room", "Could not read room_url_key from URL");
  }
  return key;
}

export function chooseStream(streams: Stream[]): string {
  const preferred = streams.find((stream) => stream.type === "hls_all" && isHttpsHls(stream.url));
  const fallback = streams.find((stream) => stream.type === "hls" && isHttpsHls(stream.url));
  const url = preferred?.url || fallback?.url;
  if (!url) throw new ResolverError(502, "stream_unavailable", "No public HLS stream was returned");
  return url;
}

function isHttpsHls(value?: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname.endsWith(".m3u8");
  } catch {
    return false;
  }
}

class ResolverError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  return {
    ...(allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff",
  };
}

async function showroomJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${SHOWROOM_ORIGIN}${path}`, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ResolverError(502, "upstream_error", `SHOWROOM returned ${response.status}`);
    }
    return response.json<T>();
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers });

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: { ...headers, "Cache-Control": "no-store" } });
    }
    if (url.pathname !== "/resolve") {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }

    try {
      const roomKey = parseRoomKey(url.searchParams.get("room") || "");
      const status = await showroomJson<{ room_id?: number; is_live?: boolean }>(
        `/api/room/status?room_url_key=${encodeURIComponent(roomKey)}`,
      );
      if (!status.room_id) throw new ResolverError(404, "room_not_found", "Room was not found");
      if (!status.is_live) throw new ResolverError(409, "not_live", "Room is not live");

      const streaming = await showroomJson<{ streaming_url_list?: Stream[] }>(
        `/api/live/streaming_url?room_id=${status.room_id}&abr_available=1`,
      );
      const streamUrl = chooseStream(streaming.streaming_url_list || []);

      return Response.json(
        { roomKey, roomId: status.room_id, streamUrl },
        { headers: { ...headers, "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      if (error instanceof ResolverError) {
        return Response.json({ error: error.code, message: error.message }, { status: error.status, headers });
      }
      console.error("Unexpected resolver error", error);
      return Response.json({ error: "resolver_failed", message: "Failed to resolve stream" }, { status: 502, headers });
    }
  },
} satisfies ExportedHandler<Env>;
