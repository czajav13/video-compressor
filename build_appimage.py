from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
APPDIR = ROOT / "AppImageDir"
APPIMAGE = ROOT / "VideoCompressor-x86_64.AppImage"


DESKTOP = """[Desktop Entry]
Type=Application
Name=Video Compressor
Comment=Compress MP4 videos with ffmpeg
Exec=VideoCompressor
Icon=video-compressor
Categories=AudioVideo;Video;
Terminal=false
"""

ICON = """<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#1f2937"/>
  <rect x="42" y="68" width="172" height="120" rx="16" fill="#f9fafb"/>
  <path d="M106 95v66l58-33z" fill="#2563eb"/>
  <path d="M62 208h132" stroke="#10b981" stroke-width="16" stroke-linecap="round"/>
  <path d="M62 208h76" stroke="#f59e0b" stroke-width="16" stroke-linecap="round"/>
</svg>
"""


def write_file(path: Path, content: str, executable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    if executable:
        path.chmod(0o755)


def copy_binary(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    target.chmod(0o755)


def main() -> int:
    if sys.platform != "linux":
        print("AppImage build must run on Linux.", file=sys.stderr)
        return 1

    app_binary = ROOT / "dist" / "VideoCompressor"
    if not app_binary.exists():
        result = subprocess.call([sys.executable, "build.py"], cwd=ROOT)
        if result != 0:
            return result

    if APPDIR.exists():
        shutil.rmtree(APPDIR)

    copy_binary(app_binary, APPDIR / "usr" / "bin" / "VideoCompressor")
    write_file(
        APPDIR / "AppRun",
        '#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/usr/bin/VideoCompressor" "$@"\n',
        executable=True,
    )
    write_file(APPDIR / "VideoCompressor.desktop", DESKTOP)
    write_file(APPDIR / "usr" / "share" / "applications" / "VideoCompressor.desktop", DESKTOP)
    write_file(APPDIR / "video-compressor.svg", ICON)
    write_file(APPDIR / "usr" / "share" / "icons" / "hicolor" / "scalable" / "apps" / "video-compressor.svg", ICON)

    appimagetool = shutil.which("appimagetool") or "/tmp/appimagetool-x86_64.AppImage"
    if not Path(appimagetool).exists():
        print("Missing appimagetool. Put it in PATH or /tmp/appimagetool-x86_64.AppImage.", file=sys.stderr)
        return 1

    Path(appimagetool).chmod(0o755)
    env = dict(os.environ)
    env["ARCH"] = "x86_64"
    env["APPIMAGE_EXTRACT_AND_RUN"] = "1"
    return subprocess.call([appimagetool, str(APPDIR), str(APPIMAGE)], cwd=ROOT, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
