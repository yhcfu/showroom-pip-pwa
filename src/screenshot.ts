export function buildScreenshotFilename(roomKey: string | undefined, capturedAt = new Date()): string {
  const room = roomKey?.replace(/[^A-Za-z0-9_-]/g, "-") || "video";
  const timestamp = capturedAt.toISOString().replace(/[:.]/g, "-");
  return `showroom-${room}-${timestamp}.png`;
}

export type ImageClipboardDependencies<T> = {
  createItem: (png: Promise<Blob>) => T;
  write: (items: T[]) => Promise<void>;
};

export async function copyPngToClipboard<T>(
  png: Promise<Blob>,
  dependencies: ImageClipboardDependencies<T> | null,
): Promise<boolean> {
  if (!dependencies) return false;
  try {
    const item = dependencies.createItem(png);
    await dependencies.write([item]);
    return true;
  } catch {
    return false;
  }
}

export function shouldCaptureFromShortcut(input: {
  key: string;
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  desktop: boolean;
  editing: boolean;
}): boolean {
  return input.desktop &&
    !input.editing &&
    !input.repeat &&
    !input.altKey &&
    !input.ctrlKey &&
    !input.metaKey &&
    input.key.toLowerCase() === "s";
}
