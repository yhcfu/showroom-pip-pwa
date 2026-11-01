export function isTransportStreamFile(file: Pick<File, "name">): boolean {
  return /\.ts$/i.test(file.name);
}

export const MAX_IN_MEMORY_LOCAL_TS_BYTES = 100 * 1024 * 1024;

export function canUseInMemoryLocalTsOutput(fileSize: number): boolean {
  return Number.isFinite(fileSize) && fileSize >= 0 && fileSize <= MAX_IN_MEMORY_LOCAL_TS_BYTES;
}

export type LocalMp4Artifact = {
  blob: Blob;
  dispose: () => Promise<void>;
};

export async function convertLocalTsToMp4(
  file: Blob,
  onProgress: (progress: number) => void = () => undefined,
): Promise<LocalMp4Artifact> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    StreamTarget,
  } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let output: InstanceType<typeof Output> | null = null;
  let temporaryDirectory: FileSystemDirectoryHandle | null = null;
  let temporaryName: string | null = null;

  const removeTemporaryFile = async () => {
    if (!temporaryDirectory || !temporaryName) return;
    const directory = temporaryDirectory;
    const name = temporaryName;
    temporaryDirectory = null;
    temporaryName = null;
    try {
      await directory.removeEntry(name);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) {
        console.warn("ローカルTSの一時ファイルを削除できませんでした。", error);
      }
    }
  };

  try {
    let target: InstanceType<typeof BufferTarget> | InstanceType<typeof StreamTarget>;
    let fileHandle: FileSystemFileHandle | null = null;
    if (typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function") {
      const root = await navigator.storage.getDirectory();
      temporaryDirectory = await root.getDirectoryHandle("showroom-pip-pwa-local-ts", { create: true });
      temporaryName = `${crypto.randomUUID()}.mp4`;
      fileHandle = await temporaryDirectory.getFileHandle(temporaryName, { create: true });
      const writable = await fileHandle.createWritable();
      target = new StreamTarget(writable, { chunked: true });
    } else {
      if (!canUseInMemoryLocalTsOutput(file.size)) {
        throw new Error("このブラウザでは100MBを超えるTSファイルを準備できません。ChromeまたはEdgeで開いてください。");
      }
      target = new BufferTarget();
    }

    output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({
      input,
      output,
      copy: { mode: "forced" },
    });
    if (!conversion.isValid) throw new Error("TSファイルの映像と音声をMP4へ変換できませんでした。");
    conversion.onProgress = onProgress;
    await conversion.execute();
    if (fileHandle) {
      return {
        blob: await fileHandle.getFile(),
        dispose: removeTemporaryFile,
      };
    }
    if (!(target instanceof BufferTarget) || !target.buffer) {
      throw new Error("MP4データを作成できませんでした。");
    }
    return {
      blob: new Blob([target.buffer], { type: "video/mp4" }),
      dispose: async () => undefined,
    };
  } catch (error) {
    await output?.cancel().catch(() => undefined);
    await removeTemporaryFile();
    if (error instanceof Error && /^(TSファイル|MP4データ)/.test(error.message)) throw error;
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("TSファイルを準備する一時保存領域が足りませんでした。", { cause: error });
    }
    throw new Error("TSファイルをMP4へ変換できませんでした。", { cause: error });
  } finally {
    input.dispose();
  }
}
