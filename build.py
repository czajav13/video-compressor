from __future__ import annotations

import shutil
import subprocess
import sys


def binary_name(name: str) -> str:
    return f"{name}.exe" if sys.platform.startswith("win") else name


def add_binary_args(name: str) -> list[str]:
    path = shutil.which(binary_name(name))
    if not path:
        return []

    separator = ";" if sys.platform.startswith("win") else ":"
    return ["--add-binary", f"{path}{separator}bin"]


def main() -> int:
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        "VideoCompressor",
        *add_binary_args("ffmpeg"),
        *add_binary_args("ffprobe"),
        "main.py",
    ]
    return subprocess.call(command)


if __name__ == "__main__":
    raise SystemExit(main())
