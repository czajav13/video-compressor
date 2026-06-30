# Video Compressor

A cross-platform desktop app for batch-compressing MP4 files with Electron and
bundled static `ffmpeg`/`ffprobe` binaries. Users do not need `ffmpeg` installed
in `PATH`.

## Features

- Batch-add MP4 files or all MP4 files from a folder.
- Pick one output folder for the whole queue.
- Compress video to H.264 MP4 with `libx264`.
- Explicit ffmpeg controls for CRF and x264 preset.
- Keep original audio by default, with optional AAC 96k or no-audio modes.
- Optional max-width scaling.
- Track current-file and total progress.
- Light and dark UI themes.
- Build native apps for Windows, macOS, and Linux from GitHub Actions.

## Requirements

- Node.js 22+
- npm

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

`npm run build` prepares the platform ffmpeg binaries, builds the renderer and
main process, and writes artifacts to `release/`.

## Test

```bash
npm run lint
npm test
```

## ffmpeg Bundling

The app uses `ffmpeg-static` and `ffprobe-static`.

```bash
npm run prepare:ffmpeg
```

This copies the current platform binaries into `build/ffmpeg/<platform>/`.
Electron Builder packages that folder as an app resource. At runtime the app
uses:

- dev: `build/ffmpeg/<platform>/ffmpeg`
- packaged: `process.resourcesPath/ffmpeg/<platform>/ffmpeg`

On Windows the executable names include `.exe`.

## CI

The GitHub Actions workflow builds native artifacts on:

- Linux AppImage: `x64`, `arm64`, `arm`
- Windows portable EXE: `x64`, `x86`
- macOS DMG: `x64`, `arm64`

## macOS Gatekeeper

The macOS build is ad-hoc signed, but it is not Apple-notarized. After download,
Gatekeeper may still quarantine it. For local testing, remove quarantine:

```bash
xattr -dr com.apple.quarantine "/Applications/Video Compressor.app"
```

For public distribution without this manual step, a paid Apple Developer ID
certificate and notarization are still required.
