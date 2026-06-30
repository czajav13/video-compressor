# Video Compressor

A cross-platform desktop app for batch-compressing MP4 files with Electron and
bundled static `ffmpeg`/`ffprobe` binaries. Users do not need `ffmpeg` installed
in `PATH`.

## Features

- Batch-add MP4 files or all MP4 files from a folder.
- Pick one output folder for the whole queue.
- Compress video to H.264 MP4 with `libx264`.
- Re-encode audio to AAC 96k.
- Simple quality slider mapped to ffmpeg CRF.
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

- `ubuntu-latest` as AppImage
- `windows-latest` as installer and portable EXE
- `macos-latest` as DMG and ZIP

## macOS Signing

macOS downloads should be signed and notarized, otherwise Gatekeeper may block
the app after download. The workflow passes standard Electron Builder signing
secrets through to `npm run build`.

Required for Developer ID signing:

- `CSC_LINK`: base64-encoded `.p12` Developer ID Application certificate or a
  secure URL supported by Electron Builder
- `CSC_KEY_PASSWORD`: password for the certificate

Required for notarization, choose one method:

- Apple ID method: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- App Store Connect API key method: `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
  `APPLE_API_ISSUER`

Without these secrets the macOS artifact is useful for local testing, but users
may need to bypass Gatekeeper manually.
