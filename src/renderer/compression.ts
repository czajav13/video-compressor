import {
  CompressionProgress,
  CompressionResult,
  CompressionSettings,
  VideoFile,
} from "../shared/ipc";
import { formatBytes } from "./format";

export type SourceVideoFile = VideoFile & {
  id: string;
  displayPath: string;
};

export type { CompressionProgress, CompressionResult, CompressionSettings };

export class CompressionCancelled extends Error {
  constructor() {
    super("Compression canceled.");
    this.name = "CompressionCancelled";
  }
}

export function qualityToCrf(quality: number): number {
  const clamped = Math.max(1, Math.min(100, quality));
  return Math.round(18 + 18 * Math.sqrt((100 - clamped) / 99));
}

export async function compressVideoFile(options: {
  file: SourceVideoFile;
  outputDirectory: string;
  settings: CompressionSettings;
  signal: AbortSignal;
  onProgress: (progress: CompressionProgress) => void;
}): Promise<CompressionResult> {
  const jobId = crypto.randomUUID();
  const removeProgressListener = window.compressor.onCompressionProgress((progress) => {
    if (progress.jobId === jobId) {
      options.onProgress(progress);
    }
  });

  const abort = () => {
    void window.compressor.cancelCompression(jobId);
  };
  options.signal.addEventListener("abort", abort, { once: true });

  try {
    return await window.compressor.compressFile({
      jobId,
      file: options.file,
      outputDirectory: options.outputDirectory,
      settings: options.settings,
    });
  } catch (error) {
    if (options.signal.aborted || isCanceledError(error)) {
      throw new CompressionCancelled();
    }
    throw error;
  } finally {
    options.signal.removeEventListener("abort", abort);
    removeProgressListener();
  }
}

export function compressionSummary(result: CompressionResult): string {
  const ratio = result.inputSize > 0 ? Math.round((1 - result.outputSize / result.inputSize) * 100) : 0;
  const ratioText = ratio > 0 ? `${ratio}% smaller` : "not smaller";
  return `${result.outputName}: ${formatBytes(result.inputSize)} -> ${formatBytes(result.outputSize)} (${ratioText})`;
}

function isCanceledError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("canceled");
}
