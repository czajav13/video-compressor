from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def binary_name(name: str) -> str:
    return f"{name}.exe" if sys.platform.startswith("win") else name


def add_binary_args(name: str) -> list[str]:
    path = shutil.which(binary_name(name))
    if not path:
        return []

    separator = ";" if sys.platform.startswith("win") else ":"
    return ["--add-binary", f"{path}{separator}bin"]


def main() -> int:
    onefile_args = [] if sys.platform == "darwin" else ["--onefile"]
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        *onefile_args,
        "--name",
        "VideoCompressor",
        *add_binary_args("ffmpeg"),
        *add_binary_args("ffprobe"),
        "main.py",
    ]
    result = subprocess.call(command)
    if result == 0:
        print_output_path()
    return result


def print_output_path() -> None:
    if sys.platform.startswith("win"):
        output = Path("dist") / "VideoCompressor.exe"
    elif sys.platform == "darwin":
        output = Path("dist") / "VideoCompressor.app"
    else:
        output = Path("dist") / "VideoCompressor"
    print(f"Built: {output}")


if __name__ == "__main__":
    raise SystemExit(main())
