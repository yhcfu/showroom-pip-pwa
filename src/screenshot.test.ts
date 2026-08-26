import { describe, expect, it } from "vitest";
import { buildScreenshotFilename, copyPngToClipboard, shouldCaptureFromShortcut } from "./screenshot";

describe("video screenshot", () => {
  it("builds a filesystem-safe PNG name", () => {
    expect(buildScreenshotFilename("room_key", new Date("2026-08-26T04:05:06.789Z")))
      .toBe("showroom-room_key-2026-08-26T04-05-06-789Z.png");
  });

  it("uses S only on an idle desktop player", () => {
    const base = {
      key: "s",
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      desktop: true,
      editing: false,
    };
    expect(shouldCaptureFromShortcut(base)).toBe(true);
    expect(shouldCaptureFromShortcut({ ...base, key: "S" })).toBe(true);
    expect(shouldCaptureFromShortcut({ ...base, desktop: false })).toBe(false);
    expect(shouldCaptureFromShortcut({ ...base, editing: true })).toBe(false);
    expect(shouldCaptureFromShortcut({ ...base, ctrlKey: true })).toBe(false);
    expect(shouldCaptureFromShortcut({ ...base, repeat: true })).toBe(false);
  });

  it("starts writing the pending PNG to the clipboard", async () => {
    let resolvePng!: (blob: Blob) => void;
    const png = new Promise<Blob>((resolve) => {
      resolvePng = resolve;
    });
    const written: Array<{ png: Promise<Blob> }> = [];
    const copy = copyPngToClipboard(png, {
      createItem: (pendingPng) => ({ png: pendingPng }),
      write: async (items) => {
        written.push(...items);
        await items[0].png;
      },
    });

    expect(written).toHaveLength(1);
    expect(written[0].png).toBe(png);
    resolvePng(new Blob(["png"], { type: "image/png" }));
    await expect(copy).resolves.toBe(true);
  });

  it("keeps screenshot delivery successful when image clipboard is unavailable", async () => {
    const png = Promise.resolve(new Blob(["png"], { type: "image/png" }));
    await expect(copyPngToClipboard(png, null)).resolves.toBe(false);
    await expect(copyPngToClipboard(png, {
      createItem: (pendingPng) => ({ png: pendingPng }),
      write: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    })).resolves.toBe(false);
  });
});
