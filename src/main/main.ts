import { app, BrowserWindow, OpenDialogOptions, dialog, ipcMain } from "electron";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { access, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CompressionRequest, IPC_CHANNELS, VideoFile } from "../shared/ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const TIME_RE = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/;

let mainWindow: BrowserWindow | null = null;
const activeJobs = new Map<string, { process: ChildProcessWithoutNullStreams; outputPath: string }>();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    title: "Video Compressor",
    backgroundColor: "#f6f7f9",
    icon: path.join(__dirname, "../../build/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist-renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.selectMp4Files, async () => {
    const result = await showOpenDialog({
      title: "Select MP4 files",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    });

    if (result.canceled) {
      return [];
    }

    return Promise.all(result.filePaths.filter(isMp4).map(toVideoFile));
  });

  ipcMain.handle(IPC_CHANNELS.selectMp4Folder, async () => {
    const result = await showOpenDialog({
      title: "Select a folder with MP4 files",
      properties: ["openDirectory"],
    });

    if (result.canceled || !result.filePaths[0]) {
      return [];
    }

    return listTopLevelMp4Files(result.filePaths[0]);
  });

  ipcMain.handle(IPC_CHANNELS.selectOutputDirectory, async () => {
    const result = await showOpenDialog({
      title: "Select output folder",
      properties: ["openDirectory", "createDirectory"],
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.compressFile, async (event, request: CompressionRequest) => {
    await mkdir(request.outputDirectory, { recursive: true });
    const outputPath = await uniqueOutputPath(request.file.name, request.outputDirectory);
    const duration = await probeDuration(request.file.path);
    const args = ffmpegArgs(request, outputPath);
    const child = spawn(toolPath("ffmpeg"), args, { windowsHide: true });
    let stderr = "";

    activeJobs.set(request.jobId, { process: child, outputPath });
    event.sender.send(IPC_CHANNELS.compressionProgress, {
      jobId: request.jobId,
      fileProgress: 0,
      message: `${request.file.name}: starting`,
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const timeMatch = TIME_RE.exec(text);
      if (!timeMatch || !duration || duration <= 0) {
        return;
      }

      const elapsed = secondsFromTimeMatch(timeMatch);
      const fileProgress = Math.min(1, elapsed / duration);
      event.sender.send(IPC_CHANNELS.compressionProgress, {
        jobId: request.jobId,
        fileProgress,
        message: `${request.file.name}: ${Math.round(fileProgress * 100)}%`,
      });
    });

    try {
      await waitForProcess(child);
    } catch (error) {
      activeJobs.delete(request.jobId);
      await unlink(outputPath).catch(() => undefined);
      if (error instanceof CompressionCanceledError) {
        throw error;
      }
      throw new Error(compactFfmpegError(stderr, error));
    }

    activeJobs.delete(request.jobId);
    const outputStat = await stat(outputPath);
    event.sender.send(IPC_CHANNELS.compressionProgress, {
      jobId: request.jobId,
      fileProgress: 1,
      message: `${request.file.name}: done`,
    });

    return {
      outputPath,
      outputName: path.basename(outputPath),
      inputSize: request.file.size,
      outputSize: outputStat.size,
    };
  });

  ipcMain.handle(IPC_CHANNELS.cancelCompression, async (_event, jobId: string) => {
    const job = activeJobs.get(jobId);
    if (!job) {
      return;
    }

    job.process.kill("SIGTERM");
    activeJobs.delete(jobId);
    await unlink(job.outputPath).catch(() => undefined);
  });
}

function ffmpegArgs(request: CompressionRequest, outputPath: string): string[] {
  const args = ["-y", "-i", request.file.path];
  const videoFilters = videoFilterArgs(request.settings.maxWidth);

  if (videoFilters.length) {
    args.push(...videoFilters);
  }

  args.push(
    "-c:v",
    "libx264",
    "-crf",
    String(normalizeCrf(request.settings.crf)),
    "-preset",
    request.settings.preset,
  );

  args.push(...audioArgs(request.settings.audioMode), "-movflags", "+faststart", outputPath);

  return args;
}

export function normalizeCrf(crf: number): number {
  if (!Number.isFinite(crf)) {
    return 30;
  }

  return Math.max(0, Math.min(51, Math.round(crf)));
}

export function audioArgs(audioMode: CompressionRequest["settings"]["audioMode"]): string[] {
  if (audioMode === "none") {
    return ["-an"];
  }
  if (audioMode === "aac96") {
    return ["-c:a", "aac", "-b:a", "96k"];
  }
  return ["-c:a", "copy"];
}

export function videoFilterArgs(maxWidth: number): string[] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return [];
  }

  return ["-vf", `scale='min(iw,${Math.round(maxWidth)})':-2`];
}

async function probeDuration(inputPath: string): Promise<number | null> {
  const child = spawn(
    toolPath("ffprobe"),
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath],
    { windowsHide: true },
  );
  let stdout = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  try {
    await waitForProcess(child);
  } catch {
    return null;
  }

  const duration = Number.parseFloat(stdout.trim());
  return Number.isFinite(duration) ? duration : null;
}

function waitForProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal || code === null) {
        reject(new CompressionCanceledError());
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function toolPath(name: "ffmpeg" | "ffprobe"): string {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg", platformName())
    : path.join(__dirname, "../../build/ffmpeg", platformName());
  return path.join(baseDir, executable);
}

function platformName(): "win" | "mac" | "linux" {
  if (process.platform === "win32") {
    return "win";
  }
  if (process.platform === "darwin") {
    return "mac";
  }
  return "linux";
}

function compactFfmpegError(stderr: string, error: unknown): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tail = lines.slice(-4).join(" ");
  const fallback = error instanceof Error ? error.message : String(error);
  return tail ? `ffmpeg failed: ${tail}` : fallback;
}

async function uniqueOutputPath(inputName: string, outputDirectory: string): Promise<string> {
  const parsed = path.parse(path.basename(inputName));
  let candidate = path.join(outputDirectory, `${parsed.name}_compressed.mp4`);
  let index = 1;

  while (true) {
    try {
      await access(candidate);
      candidate = path.join(outputDirectory, `${parsed.name}_compressed_${index}.mp4`);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

function isMp4(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".mp4";
}

async function toVideoFile(filePath: string): Promise<VideoFile> {
  const fileStat = await stat(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: fileStat.size,
  };
}

async function listTopLevelMp4Files(directory: string): Promise<VideoFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isMp4(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(files.map(toVideoFile));
}

function secondsFromTimeMatch(match: RegExpExecArray): number {
  return Number.parseInt(match[1], 10) * 3600 + Number.parseInt(match[2], 10) * 60 + Number.parseFloat(match[3]);
}

function showOpenDialog(options: OpenDialogOptions) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

class CompressionCanceledError extends Error {
  constructor() {
    super("Compression canceled.");
    this.name = "CompressionCanceledError";
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
