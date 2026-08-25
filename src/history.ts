export type RoomHistoryEntry = {
  roomKey: string;
  roomId?: number;
  roomName?: string;
  lastOpenedAt: number;
  lastCheckedAt?: number;
  isLive?: boolean;
};

const MAX_HISTORY_SIZE = 20;

function sameRoom(left: RoomHistoryEntry, right: RoomHistoryEntry): boolean {
  if (left.roomId !== undefined && right.roomId !== undefined) {
    return left.roomId === right.roomId;
  }
  return left.roomKey === right.roomKey;
}

export function upsertRoomHistory(
  entries: RoomHistoryEntry[],
  incoming: RoomHistoryEntry,
  maxSize = MAX_HISTORY_SIZE,
): RoomHistoryEntry[] {
  const existing = entries.find((entry) => sameRoom(entry, incoming));
  const merged = existing ? { ...existing, ...incoming } : incoming;

  return [merged, ...entries.filter((entry) => !sameRoom(entry, merged))]
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(0, maxSize);
}

export function mergeRoomStatus(
  entries: RoomHistoryEntry[],
  status: Pick<RoomHistoryEntry, "roomKey" | "roomId" | "roomName" | "lastCheckedAt" | "isLive">,
): RoomHistoryEntry[] {
  const existing = entries.find((entry) => sameRoom(entry, {
    ...status,
    lastOpenedAt: 0,
  }));

  if (!existing) return entries;

  return upsertRoomHistory(entries, {
    ...existing,
    ...status,
    lastOpenedAt: existing.lastOpenedAt,
  });
}

export function parseRoomHistory(value: string | null): RoomHistoryEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RoomHistoryEntry => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<RoomHistoryEntry>;
        return typeof candidate.roomKey === "string" &&
          typeof candidate.lastOpenedAt === "number" &&
          (candidate.roomId === undefined || typeof candidate.roomId === "number") &&
          (candidate.roomName === undefined || typeof candidate.roomName === "string") &&
          (candidate.lastCheckedAt === undefined || typeof candidate.lastCheckedAt === "number") &&
          (candidate.isLive === undefined || typeof candidate.isLive === "boolean");
      })
      .reduce<RoomHistoryEntry[]>((result, entry) => upsertRoomHistory(result, entry), []);
  } catch {
    return [];
  }
}
