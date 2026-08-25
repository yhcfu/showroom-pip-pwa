import {
  sendPushNotification,
  WebPushError,
  type PushSubscriptionData,
} from "@mmmike/web-push/send";

export interface Env {
  ALLOWED_ORIGINS: string;
  DB?: D1Database;
  WATCH_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

type Stream = {
  type?: string;
  url?: string;
};

type ShowroomRoomStatus = {
  room_id?: number;
  room_name?: string;
  is_live?: boolean;
};

type WatchedRoom = {
  roomKey: string;
  roomId?: number;
  roomName?: string;
};

type StoredPushSubscription = {
  id: string;
  endpoint: string;
  expiration_time: number | null;
  p256dh: string;
  auth: string;
  rooms_json: string;
  states_json: string;
  player_url: string;
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
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

async function getRoomStatus(roomKey: string): Promise<ShowroomRoomStatus> {
  return showroomJson<ShowroomRoomStatus>(
    `/api/room/status?room_url_key=${encodeURIComponent(roomKey)}`,
  );
}

function parseRoomKeys(value: string): string[] {
  const keys = [...new Set(value.split(",").map((room) => parseRoomKey(room)))];
  if (keys.length === 0) throw new ResolverError(400, "invalid_rooms", "At least one room is required");
  if (keys.length > 20) throw new ResolverError(400, "too_many_rooms", "At most 20 rooms can be checked at once");
  return keys;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    results.push(...await Promise.all(items.slice(index, index + limit).map(mapper)));
  }
  return results;
}

async function getStatuses(roomKeys: string[]) {
  return mapWithConcurrency(roomKeys, 5, async (roomKey) => {
    try {
      const status = await getRoomStatus(roomKey);
      if (!status.room_id) return { roomKey, error: "room_not_found" as const };
      return {
        roomKey,
        roomId: status.room_id,
        roomName: status.room_name,
        isLive: status.is_live === true,
      };
    } catch {
      return { roomKey, error: "upstream_error" as const };
    }
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  return Boolean(env.WATCH_TOKEN) && request.headers.get("Authorization") === `Bearer ${env.WATCH_TOKEN}`;
}

async function endpointId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parsePushSubscriptionBody(value: unknown, env: Env): {
  subscription: PushSubscriptionData & { expirationTime: number | null };
  rooms: WatchedRoom[];
  playerUrl: string;
} {
  if (!value || typeof value !== "object") throw new ResolverError(400, "invalid_subscription", "Invalid subscription");
  const body = value as Record<string, unknown>;
  const rawSubscription = body.subscription as (Partial<PushSubscriptionData> & { expirationTime?: unknown }) | undefined;
  const keys = rawSubscription?.keys;
  if (!rawSubscription || typeof rawSubscription.endpoint !== "string" ||
      !rawSubscription.endpoint.startsWith("https://") || !keys ||
      typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    throw new ResolverError(400, "invalid_subscription", "Invalid push subscription");
  }

  const rawRooms = Array.isArray(body.rooms) ? body.rooms : [];
  if (rawRooms.length > 20) throw new ResolverError(400, "too_many_rooms", "At most 20 rooms can be watched");
  const rooms = rawRooms.map((room) => {
    if (!room || typeof room !== "object") throw new ResolverError(400, "invalid_room", "Invalid room");
    const candidate = room as Record<string, unknown>;
    const roomKey = parseRoomKey(typeof candidate.roomKey === "string" ? candidate.roomKey : "");
    return {
      roomKey,
      roomId: typeof candidate.roomId === "number" && Number.isSafeInteger(candidate.roomId) ? candidate.roomId : undefined,
      roomName: typeof candidate.roomName === "string" ? candidate.roomName.slice(0, 200) : undefined,
    };
  });

  if (typeof body.playerUrl !== "string") throw new ResolverError(400, "invalid_player_url", "Invalid player URL");
  const playerUrl = new URL(body.playerUrl);
  const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (playerUrl.protocol !== "https:" || !allowedOrigins.includes(playerUrl.origin)) {
    throw new ResolverError(400, "invalid_player_url", "Player URL origin is not allowed");
  }

  return {
    subscription: {
      endpoint: rawSubscription.endpoint,
      expirationTime: typeof rawSubscription.expirationTime === "number" ? rawSubscription.expirationTime : null,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    },
    rooms,
    playerUrl: playerUrl.toString(),
  };
}

async function sendPush(env: Env, stored: StoredPushSubscription, room: WatchedRoom): Promise<"sent" | "expired" | "failed"> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return "failed";
  const target = new URL(stored.player_url);
  target.search = new URLSearchParams({ room: room.roomKey }).toString();
  target.hash = "";
  try {
    const delivered = await sendPushNotification(
      {
        endpoint: stored.endpoint,
        keys: { p256dh: stored.p256dh, auth: stored.auth },
      },
      {
        title: `${room.roomName || room.roomKey} が配信を開始しました`,
        body: "タップしてプレイヤーを開く",
        tag: `showroom-live-${room.roomId || room.roomKey}`,
        url: target.toString(),
      },
      {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      },
      { ttl: 300, urgency: "high", timeoutMs: 10_000 },
    );
    return delivered ? "sent" : "expired";
  } catch (error) {
    if (error instanceof WebPushError) {
      console.error("Push service rejected Web Push", { statusCode: error.statusCode, retryAfterMs: error.retryAfterMs });
    } else {
      console.error("Failed to send Web Push", error instanceof Error ? error.message : "unknown error");
    }
    return "failed";
  }
}

function resolverErrorResponse(error: unknown, headers: HeadersInit): Response {
  if (error instanceof ResolverError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status, headers });
  }
  console.error("Unexpected resolver error", error);
  return Response.json({ error: "resolver_failed", message: "Resolver request failed" }, { status: 502, headers });
}

async function storePushSubscription(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  if (!env.DB || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return Response.json({ error: "push_not_configured" }, { status: 503, headers });
  }

  try {
    const { subscription, rooms, playerUrl } = parsePushSubscriptionBody(await request.json(), env);
    const id = await endpointId(subscription.endpoint);
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (
        id, endpoint, expiration_time, p256dh, auth, rooms_json, states_json, player_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        endpoint = excluded.endpoint,
        expiration_time = excluded.expiration_time,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        rooms_json = excluded.rooms_json,
        player_url = excluded.player_url,
        updated_at = excluded.updated_at
    `).bind(
      id,
      subscription.endpoint,
      subscription.expirationTime,
      subscription.keys.p256dh,
      subscription.keys.auth,
      JSON.stringify(rooms),
      playerUrl,
      Date.now(),
    ).run();
    return Response.json({ ok: true, watchedRooms: rooms.length }, { headers });
  } catch (error) {
    return resolverErrorResponse(error, headers);
  }
}

async function deletePushSubscription(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  if (!env.DB) return Response.json({ error: "push_not_configured" }, { status: 503, headers });

  try {
    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) {
      throw new ResolverError(400, "invalid_subscription", "Invalid push subscription endpoint");
    }
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
      .bind(await endpointId(body.endpoint))
      .run();
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return resolverErrorResponse(error, headers);
  }
}

function readStoredRooms(value: string): WatchedRoom[] {
  try {
    const rooms = JSON.parse(value) as unknown;
    return Array.isArray(rooms) ? rooms.slice(0, 20).filter((room): room is WatchedRoom =>
      Boolean(room) && typeof room === "object" && typeof (room as WatchedRoom).roomKey === "string"
    ) : [];
  } catch {
    return [];
  }
}

function readStoredStates(value: string): Record<string, boolean> {
  try {
    const states = JSON.parse(value) as unknown;
    if (!states || typeof states !== "object" || Array.isArray(states)) return {};
    return Object.fromEntries(Object.entries(states).filter((entry): entry is [string, boolean] =>
      typeof entry[1] === "boolean"
    ));
  } catch {
    return {};
  }
}

async function checkPushSubscription(env: Env, stored: StoredPushSubscription): Promise<void> {
  if (!env.DB) return;
  const rooms = readStoredRooms(stored.rooms_json);
  if (rooms.length === 0) return;

  const statuses = await getStatuses(rooms.map((room) => room.roomKey));
  const previousStates = readStoredStates(stored.states_json);
  const nextStates = { ...previousStates };
  let expired = false;

  for (const status of statuses) {
    if ("error" in status) continue;
    const room = rooms.find((candidate) =>
      status.roomId !== undefined && candidate.roomId !== undefined
        ? status.roomId === candidate.roomId
        : status.roomKey === candidate.roomKey
    );
    if (!room) continue;

    if (status.isLive && previousStates[room.roomKey] === false) {
      const result = await sendPush(env, stored, { ...room, ...status });
      if (result === "expired") {
        expired = true;
        break;
      }
      if (result === "failed") continue;
    }
    nextStates[room.roomKey] = status.isLive;
  }

  if (expired) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(stored.id).run();
    return;
  }
  await env.DB.prepare("UPDATE push_subscriptions SET states_json = ? WHERE id = ?")
    .bind(JSON.stringify(nextStates), stored.id)
    .run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (url.pathname === "/push/subscription" && request.method === "PUT") {
      return storePushSubscription(request, env, headers);
    }
    if (url.pathname === "/push/subscription" && request.method === "DELETE") {
      return deletePushSubscription(request, env, headers);
    }
    if (request.method !== "GET") {
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
    }
    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: { ...headers, "Cache-Control": "no-store" } });
    }
    if (url.pathname === "/push/public-key") {
      if (!env.VAPID_PUBLIC_KEY) {
        return Response.json({ error: "push_not_configured" }, { status: 503, headers });
      }
      return Response.json(
        { publicKey: env.VAPID_PUBLIC_KEY },
        { headers: { ...headers, "Cache-Control": "public, max-age=3600" } },
      );
    }
    if (url.pathname === "/status") {
      try {
        const roomKeys = parseRoomKeys(url.searchParams.get("rooms") || "");
        const rooms = await getStatuses(roomKeys);
        return Response.json(
          { rooms, checkedAt: Date.now() },
          { headers: { ...headers, "Cache-Control": "private, no-store" } },
        );
      } catch (error) {
        return resolverErrorResponse(error, headers);
      }
    }

    if (url.pathname !== "/resolve") {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }

    try {
      const roomKey = parseRoomKey(url.searchParams.get("room") || "");
      const status = await getRoomStatus(roomKey);
      if (!status.room_id) throw new ResolverError(404, "room_not_found", "Room was not found");
      if (!status.is_live) throw new ResolverError(409, "not_live", "Room is not live");

      const streaming = await showroomJson<{ streaming_url_list?: Stream[] }>(
        `/api/live/streaming_url?room_id=${status.room_id}&abr_available=1`,
      );
      const streamUrl = chooseStream(streaming.streaming_url_list || []);

      return Response.json(
        { roomKey, roomId: status.room_id, roomName: status.room_name, streamUrl },
        { headers: { ...headers, "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return resolverErrorResponse(error, headers);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.DB || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
    const { results = [] } = await env.DB.prepare(`
      SELECT id, endpoint, expiration_time, p256dh, auth, rooms_json, states_json, player_url
      FROM push_subscriptions
      WHERE rooms_json != '[]'
      ORDER BY updated_at DESC
      LIMIT 100
    `).all<StoredPushSubscription>();
    ctx.waitUntil(mapWithConcurrency(results, 3, async (stored) => {
      try {
        await checkPushSubscription(env, stored);
      } catch (error) {
        console.error("Failed to check push subscription", stored.id, error);
      }
    }).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
