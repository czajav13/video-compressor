export type VideoFile = {
  path: string;
  name: string;
  size: number;
};

export type CompressionSettings = {
  crf: number;
  preset: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  audioMode: "copy" | "aac96" | "none";
  maxWidth: number;
};

export type CompressionRequest = {
  jobId: string;
  file: VideoFile;
  outputDirectory: string;
  settings: CompressionSettings;
};

export type CompressionProgress = {
  jobId: string;
  fileProgress: number;
  message: string;
};

export type CompressionResult = {
  outputPath: string;
  outputName: string;
  inputSize: number;
  outputSize: number;
};

export type CompressorApi = {
  selectMp4Files: () => Promise<VideoFile[]>;
  selectMp4Folder: () => Promise<VideoFile[]>;
  selectOutputDirectory: () => Promise<string | null>;
  compressFile: (request: CompressionRequest) => Promise<CompressionResult>;
  cancelCompression: (jobId: string) => Promise<void>;
  onCompressionProgress: (listener: (progress: CompressionProgress) => void) => () => void;
};

export const IPC_CHANNELS = {
  selectMp4Files: "dialog:select-mp4-files",
  selectMp4Folder: "dialog:select-mp4-folder",
  selectOutputDirectory: "dialog:select-output-directory",
  compressFile: "compression:compress-file",
  cancelCompression: "compression:cancel",
  compressionProgress: "compression:progress",
} as const;
