import type {
  FragmentLoaderContext,
  FragmentLoaderConstructor,
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
} from "hls.js";

export const BUFFER_RETENTION_MS = 24 * 60 * 60 * 1000;
export const BUFFER_DESIRED_BYTES = 1024 * 1024 * 1024;
export const BUFFER_VIRTUAL_PATH = "/__showroom_buffer__/";

const DATABASE_NAME = "showroom-pip-buffer-v1";
const DATABASE_VERSION = 1;
const SESSION_STORE = "sessions";
const META_STORE = "segmentMeta";
const DATA_STORE = "segmentData";

export interface ResumeMarker {
  level: number;
  sequence: number;
  offset: number;
  savedAt: number;
}

interface BufferSession {
  sessionKey: string;
  roomKey?: string;
  streamUrl: string;
  updatedAt: number;
  totalBytes: number;
}

export interface SegmentMeta {
  id: string;
  sessionKey: string;
  level: number;
  sequence: number | "initSegment";
  duration: number;
  cc: number;
  programDateTime: number | null;
  storedAt: number;
  byteLength: number;
}

interface SegmentData {
  id: string;
  payload: ArrayBuffer;
}

export interface ReplaySegment extends SegmentMeta {
  sequence: number;
  timelineStart: number;
}

export interface ReplayPlan {
  playlist: string;
  startPosition: number;
  segments: ReplaySegment[];
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: "sessionKey" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        const meta = database.createObjectStore(META_STORE, { keyPath: "id" });
        meta.createIndex("sessionKey", "sessionKey");
        meta.createIndex("storedAt", "storedAt");
      }
      if (!database.objectStoreNames.contains(DATA_STORE)) {
        database.createObjectStore(DATA_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
  });
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function buildBufferSessionKey(roomKey: string | undefined, streamUrl: string): string {
  return `${roomKey || "direct"}-${hash(streamUrl)}`;
}

export function computeAdaptiveByteLimit(
  estimate: { quota?: number; usage?: number },
  currentCacheBytes: number,
  desiredBytes = BUFFER_DESIRED_BYTES,
): number {
  const quota = estimate.quota;
  const usage = estimate.usage;
  if (!Number.isFinite(quota) || !Number.isFinite(usage)) return desiredBytes;
  const reusableCapacity = Math.max(0, (quota ?? 0) - (usage ?? 0) + currentCacheBytes);
  return Math.max(0, Math.min(desiredBytes, Math.floor(reusableCapacity / 2)));
}

function segmentId(sessionKey: string, context: FragmentLoaderContext): string {
  const fragment = context.frag;
  const range = `${context.rangeStart ?? ""}-${context.rangeEnd ?? ""}`;
  return `${sessionKey}|${fragment.level}|${fragment.sn}|${hash(`${fragment.url}|${range}`)}`;
}

export function virtualSegmentUrl(origin: string, id: string): string {
  return new URL(`${BUFFER_VIRTUAL_PATH}${encodeURIComponent(id)}`, origin).toString();
}

function readVirtualSegmentId(value: string): string | null {
  try {
    const url = new URL(value);
    if (!url.pathname.startsWith(BUFFER_VIRTUAL_PATH)) return null;
    return decodeURIComponent(url.pathname.slice(BUFFER_VIRTUAL_PATH.length));
  } catch {
    return null;
  }
}

function chooseReplayRun(segments: SegmentMeta[], marker: ResumeMarker): SegmentMeta[] {
  const bySequence = new Map<number, SegmentMeta>();
  for (const segment of segments) {
    if (typeof segment.sequence !== "number") continue;
    const existing = bySequence.get(segment.sequence);
    const isPreferredMarker = segment.sequence === marker.sequence && segment.level === marker.level;
    if (!existing || isPreferredMarker || segment.storedAt > existing.storedAt) bySequence.set(segment.sequence, segment);
  }
  const sorted = [...bySequence.values()].sort((left, right) => Number(left.sequence) - Number(right.sequence));
  const runs: SegmentMeta[][] = [];
  for (const segment of sorted) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (!run || Number(segment.sequence) !== Number(previous?.sequence) + 1) runs.push([segment]);
    else run.push(segment);
  }
  return runs.find((run) => run.some((segment) => segment.sequence === marker.sequence)) ?? runs.at(-1) ?? [];
}

export function buildReplayPlan(
  allSegments: SegmentMeta[],
  marker: ResumeMarker,
  origin: string,
): ReplayPlan | null {
  const run = chooseReplayRun(allSegments, marker);
  if (run.length === 0) return null;
  const initByLevel = new Map<number, SegmentMeta>();
  for (const init of allSegments
    .filter((segment) => segment.sequence === "initSegment")
    .sort((left, right) => left.storedAt - right.storedAt)) {
    initByLevel.set(init.level, init);
  }
  const targetDuration = Math.max(1, Math.ceil(Math.max(...run.map((segment) => segment.duration))));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${run[0].sequence}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
  ];
  let timelineStart = 0;
  let previousCc = run[0].cc;
  let previousLevel: number | null = null;
  const replaySegments: ReplaySegment[] = [];
  for (const segment of run) {
    if (segment.cc !== previousCc || (previousLevel !== null && segment.level !== previousLevel)) lines.push("#EXT-X-DISCONTINUITY");
    if (segment.level !== previousLevel) {
      const init = initByLevel.get(segment.level);
      if (init) lines.push(`#EXT-X-MAP:URI="${virtualSegmentUrl(origin, init.id)}"`);
    }
    if (segment.programDateTime !== null) lines.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(segment.programDateTime).toISOString()}`);
    lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
    lines.push(virtualSegmentUrl(origin, segment.id));
    replaySegments.push({ ...segment, sequence: Number(segment.sequence), timelineStart });
    timelineStart += segment.duration;
    previousCc = segment.cc;
    previousLevel = segment.level;
  }
  lines.push("#EXT-X-ENDLIST", "");

  const resumeSegment = replaySegments.find((segment) => segment.sequence === marker.sequence) ?? replaySegments[0];
  const startPosition = resumeSegment.timelineStart + Math.max(0, Math.min(marker.offset, Math.max(0, resumeSegment.duration - 0.1)));
  return { playlist: lines.join("\n"), startPosition, segments: replaySegments };
}

function cachedStats(byteLength: number): LoaderStats {
  const now = performance.now();
  const timing = { start: now, first: now, end: now };
  return {
    aborted: false,
    loaded: byteLength,
    retry: 0,
    total: byteLength,
    chunkCount: 1,
    bwEstimate: 0,
    loading: { ...timing },
    parsing: { ...timing },
    buffering: { ...timing },
  };
}

export class PersistentBufferStore {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private pruneTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly sessionKey: string,
    private readonly streamUrl: string,
    private readonly roomKey?: string,
  ) {}

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  async save(context: FragmentLoaderContext, payload: ArrayBuffer): Promise<void> {
    const fragment = context.frag;
    if (context.part || fragment.encrypted || payload.byteLength === 0) return;
    if (fragment.sn !== "initSegment" && (!Number.isFinite(fragment.duration) || fragment.duration <= 0)) return;
    const database = await this.database();
    const transaction = database.transaction([SESSION_STORE, META_STORE, DATA_STORE], "readwrite");
    const sessions = transaction.objectStore(SESSION_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    const dataStore = transaction.objectStore(DATA_STORE);
    const id = segmentId(this.sessionKey, context);
    const existing = await requestResult(metaStore.get(id) as IDBRequest<SegmentMeta | undefined>);
    const now = Date.now();
    const meta: SegmentMeta = {
      id,
      sessionKey: this.sessionKey,
      level: fragment.level,
      sequence: fragment.sn,
      duration: fragment.sn === "initSegment" ? 0 : fragment.duration,
      cc: fragment.cc,
      programDateTime: fragment.programDateTime,
      storedAt: now,
      byteLength: payload.byteLength,
    };
    const session = await requestResult(sessions.get(this.sessionKey) as IDBRequest<BufferSession | undefined>);
    sessions.put({
      sessionKey: this.sessionKey,
      roomKey: this.roomKey,
      streamUrl: this.streamUrl,
      updatedAt: now,
      totalBytes: Math.max(0, (session?.totalBytes ?? 0) - (existing?.byteLength ?? 0) + payload.byteLength),
    } satisfies BufferSession);
    metaStore.put(meta);
    dataStore.put({ id, payload } satisfies SegmentData);
    await transactionDone(transaction);
    this.schedulePrune();
  }

  async load(id: string): Promise<ArrayBuffer | null> {
    const database = await this.database();
    const transaction = database.transaction(DATA_STORE, "readonly");
    const entry = await requestResult(transaction.objectStore(DATA_STORE).get(id) as IDBRequest<SegmentData | undefined>);
    return entry?.payload ?? null;
  }

  async replay(marker: ResumeMarker, origin: string): Promise<ReplayPlan | null> {
    await this.prune();
    if (Date.now() - marker.savedAt > BUFFER_RETENTION_MS) return null;
    const database = await this.database();
    const transaction = database.transaction(META_STORE, "readonly");
    const index = transaction.objectStore(META_STORE).index("sessionKey");
    const segments = await requestResult(index.getAll(this.sessionKey) as IDBRequest<SegmentMeta[]>);
    return buildReplayPlan(segments, marker, origin);
  }

  private schedulePrune() {
    if (this.pruneTimer !== undefined) return;
    this.pruneTimer = setTimeout(() => {
      this.pruneTimer = undefined;
      void this.prune();
    }, 30_000);
  }

  async prune(): Promise<void> {
    const database = await this.database();
    const sessionTransaction = database.transaction(SESSION_STORE, "readonly");
    const existingSessions = await requestResult(sessionTransaction.objectStore(SESSION_STORE).getAll() as IDBRequest<BufferSession[]>);
    let totalBytes = existingSessions.reduce((total, session) => total + session.totalBytes, 0);
    const estimate = typeof navigator.storage?.estimate === "function" ? await navigator.storage.estimate() : {};
    const byteLimit = computeAdaptiveByteLimit(estimate, totalBytes);
    const cutoff = Date.now() - BUFFER_RETENTION_MS;
    if (existingSessions.every((session) => session.updatedAt >= cutoff) && totalBytes <= byteLimit) return;

    const transaction = database.transaction([SESSION_STORE, META_STORE, DATA_STORE], "readwrite");
    const sessions = transaction.objectStore(SESSION_STORE);
    const meta = transaction.objectStore(META_STORE);
    const data = transaction.objectStore(DATA_STORE);
    const totals = new Map(existingSessions.map((session) => [session.sessionKey, session]));
    await new Promise<void>((resolve, reject) => {
      const request = meta.index("storedAt").openCursor();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB cursor failed"));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const segment = cursor.value as SegmentMeta;
        if (segment.storedAt < cutoff || totalBytes > byteLimit) {
          cursor.delete();
          data.delete(segment.id);
          totalBytes = Math.max(0, totalBytes - segment.byteLength);
          const session = totals.get(segment.sessionKey);
          if (session) session.totalBytes = Math.max(0, session.totalBytes - segment.byteLength);
        }
        cursor.continue();
      };
    });
    for (const session of totals.values()) {
      if (session.totalBytes === 0 || session.updatedAt < cutoff) sessions.delete(session.sessionKey);
      else sessions.put(session);
    }
    await transactionDone(transaction);
  }
}

export function createPersistentFragmentLoader(
  DefaultLoader: HlsConfig["loader"],
  store: PersistentBufferStore,
): FragmentLoaderConstructor {
  return class PersistentFragmentLoader implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = cachedStats(0);
    private delegate: Loader<FragmentLoaderContext>;
    private aborted = false;

    constructor(config: HlsConfig) {
      this.delegate = new DefaultLoader(config) as Loader<FragmentLoaderContext>;
    }

    load(context: FragmentLoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>): void {
      this.context = context;
      const cachedId = readVirtualSegmentId(context.url);
      if (cachedId) {
        void store.load(cachedId).then((payload) => {
          if (this.aborted) return;
          if (!payload) {
            callbacks.onError({ code: 404, text: "保存済み映像が見つかりません。" }, context, null, this.stats);
            return;
          }
          this.stats = cachedStats(payload.byteLength);
          callbacks.onSuccess({ url: context.url, data: payload, code: 200 }, this.stats, context, null);
        }).catch(() => {
          if (!this.aborted) callbacks.onError({ code: 500, text: "保存済み映像を読み込めません。" }, context, null, this.stats);
        });
        return;
      }
      this.delegate.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, loadedContext, networkDetails) => {
          const payload = response.data;
          if (payload instanceof ArrayBuffer) void store.save(loadedContext, payload.slice(0)).catch(() => undefined);
          callbacks.onSuccess(response, stats, loadedContext, networkDetails);
        },
      });
      this.stats = this.delegate.stats;
    }

    abort(): void {
      this.aborted = true;
      this.stats.aborted = true;
      this.delegate.abort();
    }

    destroy(): void {
      this.aborted = true;
      this.delegate.destroy();
      this.context = null;
    }

    getCacheAge(): number | null {
      return this.delegate.getCacheAge?.() ?? null;
    }

    getResponseHeader(name: string): string | null {
      return this.delegate.getResponseHeader?.(name) ?? null;
    }
  };
}

export function findReplayMarker(plan: ReplayPlan, currentTime: number): ResumeMarker {
  const segment = [...plan.segments].reverse().find((entry) => currentTime >= entry.timelineStart) ?? plan.segments[0];
  return {
    level: segment.level,
    sequence: segment.sequence,
    offset: Math.max(0, Math.min(segment.duration, currentTime - segment.timelineStart)),
    savedAt: Date.now(),
  };
}
