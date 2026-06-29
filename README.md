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
- `ffmpeg`, and preferably `ffprobe`, available in `PATH`

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

`build.py` automatically bundles `ffmpeg` and `ffprobe` if it finds them in `PATH`.
You can also add the folder manually as application data.

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
