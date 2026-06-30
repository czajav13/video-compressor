import { chmod, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ffmpegPath = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");
const ffprobePath = typeof ffprobeStatic === "string" ? ffprobeStatic : ffprobeStatic.path;

if (!ffmpegPath || !ffprobePath) {
  throw new Error("Could not resolve ffmpeg-static or ffprobe-static binary path.");
}

const platform = platformName();
const extension = process.platform === "win32" ? ".exe" : "";
const targetDir = path.resolve("build", "ffmpeg", platform);

await mkdir(targetDir, { recursive: true });
await copyBinary(ffmpegPath, path.join(targetDir, `ffmpeg${extension}`));
await copyBinary(ffprobePath, path.join(targetDir, `ffprobe${extension}`));

console.log(`Prepared ffmpeg binaries in ${targetDir}`);

async function copyBinary(source, target) {
  await copyFile(source, target);
  if (process.platform !== "win32") {
    await chmod(target, 0o755);
  }
}

function platformName() {
  if (process.platform === "win32") {
    return "win";
  }
  if (process.platform === "darwin") {
    return "mac";
  }
  return "linux";
}
