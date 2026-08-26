export const LIVE_HLS_CONFIG = Object.freeze({
  lowLatencyMode: true,
  backBufferLength: Number.POSITIVE_INFINITY,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: Number.POSITIVE_INFINITY,
});

export function highestQualityLevel(levels: ReadonlyArray<{
  height?: number;
  width?: number;
  bitrate?: number;
  averageBitrate?: number;
}>): number {
  if (levels.length === 0) return -1;
  return levels.reduce((bestIndex, level, index) => {
    const best = levels[bestIndex];
    const pixels = (level.width ?? 0) * (level.height ?? 0);
    const bestPixels = (best.width ?? 0) * (best.height ?? 0);
    if (pixels !== bestPixels) return pixels > bestPixels ? index : bestIndex;
    const bitrate = level.averageBitrate ?? level.bitrate ?? 0;
    const bestBitrate = best.averageBitrate ?? best.bitrate ?? 0;
    return bitrate > bestBitrate ? index : bestIndex;
  }, 0);
}
