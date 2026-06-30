# Video Compressor

A simple GUI application for batch-compressing MP4 files with `ffmpeg`.
The default settings match `skrypt.sh`:

```bash
ffmpeg -y -i input.mp4 -c:v libx264 -crf 30 -preset veryfast -c:a aac -b:a 96k output.mp4
```

## Development Run

Requirements:

- Python 3.10+
- dependencies from `requirements.txt`
- `ffmpeg`, and preferably `ffprobe`, available in `PATH` for development runs

```bash
python -m pip install -r requirements.txt
python main.py
```

## Bundling ffmpeg

The application looks for binaries in this order:

1. `ffmpeg/<platform>/ffmpeg`
2. `bin/ffmpeg`
3. system `PATH`

On Windows, the binary name is `ffmpeg.exe`.

Example structure:

```text
ffmpeg/
  win/
    ffmpeg.exe
    ffprobe.exe
  mac/
    ffmpeg
    ffprobe
  linux/
    ffmpeg
    ffprobe
```

## Application Build

The simplest path is PyInstaller:

```bash
pip install -r requirements.txt
python build.py
```

On Linux and Windows, `build.py` creates a single file:

- Linux: `dist/VideoCompressor`
- Windows: `dist/VideoCompressor.exe`

On macOS, it creates a native bundle:

- macOS: `dist/VideoCompressor.app`

`build.py` bundles `ffmpeg` into the app. It first checks `FFMPEG_BIN_DIR`,
then uses the portable binary from `imageio-ffmpeg`, and finally falls back to
`PATH`. The build fails if no `ffmpeg` binary can be bundled.

`ffprobe` is optional. If `FFMPEG_BIN_DIR` or `PATH` contains `ffprobe`, it is
bundled too; otherwise the app falls back to parsing duration from `ffmpeg`
output.

To force a specific ffmpeg build:

```bash
FFMPEG_BIN_DIR=/path/to/ffmpeg/bin python build.py
```

On Windows, `FFMPEG_BIN_DIR` must point to the folder containing `ffmpeg.exe`.

AppImage on Linux:

```bash
python build_appimage.py
```

Linux/macOS:

```bash
pyinstaller --noconfirm --windowed --name VideoCompressor --add-data "ffmpeg:ffmpeg" main.py
```

Windows:

```powershell
pyinstaller --noconfirm --windowed --name VideoCompressor --add-data "ffmpeg;ffmpeg" main.py
```

The output is available in `dist/VideoCompressor`.

## Windows/macOS/Linux Build in CI

The `.github/workflows/build.yml` workflow builds artifacts on native runners:

- Linux on `ubuntu-latest`
- Windows on `windows-latest`
- macOS on `macos-latest`

In practice, this is the most reliable method because PyInstaller does not provide a full macOS/Windows cross-build from Linux.
