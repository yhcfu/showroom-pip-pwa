import type { ReplayPlan, ResumeMarker } from "./persistent-buffer";

const MP4_MIME_TYPES = [
  "video/mp4;codecs=avc1.424028,mp4a.40.2",
  "video/mp4",
];

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
};

export function selectMp4MimeType(isSupported: (type: string) => boolean): string | null {
  return MP4_MIME_TYPES.find(isSupported) ?? null;
}

export function canExportMp4(video: CapturableVideo): boolean {
  return typeof video.captureStream === "function" &&
    typeof MediaRecorder !== "undefined" &&
    selectMp4MimeType((type) => MediaRecorder.isTypeSupported(type)) !== null;
}

export function replayDuration(plan: ReplayPlan): number {
  const last = plan.segments.at(-1);
  return last ? last.timelineStart + last.duration : 0;
}

export function markerTime(plan: ReplayPlan, marker: ResumeMarker): number | null {
  const segment = plan.segments.find((entry) => entry.sequence === marker.sequence && entry.level === marker.level) ??
    plan.segments.find((entry) => entry.sequence === marker.sequence);
  return segment
    ? segment.timelineStart + Math.max(0, Math.min(marker.offset, segment.duration))
    : null;
}

export function formatClipTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatClipTimeInput(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const wholeSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  const fraction = String(milliseconds % 1000).padStart(3, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}.${fraction}`
    : `${minutes}:${String(remainder).padStart(2, "0")}.${fraction}`;
}

export function parseClipTime(value: string): number | null {
  const parts = value.trim().split(":");
  if (
    parts.length === 0 ||
    parts.length > 3 ||
    parts.some((part, index) => !(index === parts.length - 1 ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/).test(part))
  ) return null;
  const numbers = parts.map(Number);
  const seconds = numbers.at(-1) ?? 0;
  const minutes = numbers.length > 1 ? numbers.at(-2) ?? 0 : 0;
  const hours = numbers.length > 2 ? numbers[0] : 0;
  if (seconds >= 60 || (numbers.length > 2 && minutes >= 60)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseClipTimeWithinRange(value: string, maximum: number): number | null {
  if (!Number.isFinite(maximum) || maximum < 0) return null;
  const parsed = parseClipTime(value);
  const roundedMaximum = Math.round(maximum * 1000) / 1000;
  return parsed !== null && parsed <= roundedMaximum ? Math.min(parsed, maximum) : null;
}

export function buildClipFilename(roomKey: string | undefined, exportedAt = new Date()): string {
  const room = roomKey?.replace(/[^A-Za-z0-9_-]/g, "-") || "video";
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, "-");
  return `showroom-${room}-${timestamp}.mp4`;
}

function waitForSeek(video: HTMLVideoElement, position: number): Promise<void> {
  if (Math.abs(video.currentTime - position) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("切り出す位置への移動がタイムアウトしました。"));
    }, 30_000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("切り出す映像を読み込めませんでした。"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = position;
  });
}

export async function recordMp4Range(
  video: CapturableVideo,
  start: number,
  end: number,
  onProgress: (position: number) => void = () => undefined,
): Promise<Blob> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new RangeError("切り出す範囲が正しくありません。");
  }
  if (!canExportMp4(video) || !video.captureStream) {
    throw new Error("このブラウザはMP4の切り出しに対応していません。");
  }
  const mimeType = selectMp4MimeType((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("このブラウザはMP4の切り出しに対応していません。");

  await waitForSeek(video, start);
  const stream = video.captureStream();
  if (stream.getVideoTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("切り出す映像を取得できませんでした。");
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("この端末ではMP4録画を開始できませんでした。");
  }
  // shortcut: 録画chunkは完了までメモリに置く。長時間保存が必要になったらFile System Access APIへ逐次書き込む。
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    let frameRequest = 0;
    let stallTimer = 0;
    let settled = false;
    let failed = false;
    let lastProgress = start - 1;

    const cleanup = () => {
      if (frameRequest) video.cancelVideoFrameCallback(frameRequest);
      window.clearTimeout(stallTimer);
      video.removeEventListener("error", fail);
      video.removeEventListener("ended", endedEarly);
      video.pause();
      stream.getTracks().forEach((track) => track.stop());
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      failed = true;
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
      reject(new Error("MP4の作成中に映像を読み込めなくなりました。"));
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      video.pause();
      recorder.stop();
    };
    const endedEarly = () => {
      if (video.currentTime + 0.05 < end) fail();
      else finish();
    };
    const armStallTimer = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(fail, 30_000);
    };
    const checkFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (settled) return;
      armStallTimer();
      if (metadata.mediaTime - lastProgress >= 0.25) {
        lastProgress = metadata.mediaTime;
        onProgress(Math.min(metadata.mediaTime, end));
      }
      if (metadata.mediaTime >= end) {
        finish();
        return;
      }
      frameRequest = video.requestVideoFrameCallback(checkFrame);
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", fail, { once: true });
    recorder.addEventListener("stop", () => {
      cleanup();
      if (failed) return;
      if (chunks.length === 0) {
        reject(new Error("MP4データを作成できませんでした。"));
        return;
      }
      onProgress(end);
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    }, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.addEventListener("ended", endedEarly);

    try {
      recorder.start(1000);
      armStallTimer();
      frameRequest = video.requestVideoFrameCallback(checkFrame);
      void video.play().catch(fail);
    } catch {
      fail();
    }
  });
}
