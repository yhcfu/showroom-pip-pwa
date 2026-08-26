export const AUDIO_BALANCE_KEY = "showroom-pip-audio-balance-v1";

export function clampBalance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function parseStoredBalance(value: string | null): number {
  if (value === null || value.trim() === "") return 0;
  return clampBalance(Number(value));
}

export function formatBalance(value: number): string {
  const balance = clampBalance(value);
  if (Math.abs(balance) < 0.01) return "C";
  return `${balance < 0 ? "L" : "R"}${Math.round(Math.abs(balance) * 100)}`;
}
