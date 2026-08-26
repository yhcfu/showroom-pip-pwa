export type RoomHistoryEntry = {
  roomKey: string;
  roomId?: number;
  roomName?: string;
  lastOpenedAt: number;
  pinnedAt?: number;
};

const MAX_HISTORY_SIZE = 20;

function sameRoom(left: RoomHistoryEntry, right: RoomHistoryEntry): boolean {
  if (left.roomId !== undefined && right.roomId !== undefined) {
    return left.roomId === right.roomId;
  }
  return left.roomKey === right.roomKey;
}

function sortAndLimit(entries: RoomHistoryEntry[], maxSize: number): RoomHistoryEntry[] {
  const pinned = entries
    .filter((entry) => entry.pinnedAt !== undefined)
    .sort((left, right) => (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0));
  const recent = entries
    .filter((entry) => entry.pinnedAt === undefined)
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(0, maxSize);
  return [...pinned, ...recent];
}

export function upsertRoomHistory(
  entries: RoomHistoryEntry[],
  incoming: RoomHistoryEntry,
  maxSize = MAX_HISTORY_SIZE,
): RoomHistoryEntry[] {
  const existing = entries.find((entry) => sameRoom(entry, incoming));
  const merged = existing ? { ...existing, ...incoming } : incoming;

  return sortAndLimit([merged, ...entries.filter((entry) => !sameRoom(entry, merged))], maxSize);
}

export function setRoomPinned(
  entries: RoomHistoryEntry[],
  target: RoomHistoryEntry,
  pinned: boolean,
  pinnedAt = Date.now(),
  maxSize = MAX_HISTORY_SIZE,
): RoomHistoryEntry[] {
  const updated = entries.map((entry) => {
    if (!sameRoom(entry, target)) return entry;
    if (pinned) return { ...entry, pinnedAt };
    const { pinnedAt: _pinnedAt, ...unpinned } = entry;
    return unpinned;
  });
  return sortAndLimit(updated, maxSize);
}

export function parseRoomHistory(value: string | null): RoomHistoryEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Omit<RoomHistoryEntry, "pinnedAt"> & { pinnedAt?: unknown } => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<RoomHistoryEntry>;
        return typeof candidate.roomKey === "string" &&
          typeof candidate.lastOpenedAt === "number" &&
          (candidate.roomId === undefined || typeof candidate.roomId === "number") &&
          (candidate.roomName === undefined || typeof candidate.roomName === "string");
      })
      .map((entry) => ({
        roomKey: entry.roomKey,
        roomId: entry.roomId,
        roomName: entry.roomName,
        lastOpenedAt: entry.lastOpenedAt,
        pinnedAt: typeof entry.pinnedAt === "number" && Number.isFinite(entry.pinnedAt)
          ? entry.pinnedAt
          : undefined,
      }))
      .reduce<RoomHistoryEntry[]>((result, entry) => upsertRoomHistory(result, entry), []);
  } catch {
    return [];
  }
}
