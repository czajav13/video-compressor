from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


BUILD_BINARY_DIR = Path(".build-binaries")


def binary_name(name: str) -> str:
    return f"{name}.exe" if sys.platform.startswith("win") else name


def binary_from_env(name: str) -> str | None:
    env_dir = os.environ.get("FFMPEG_BIN_DIR")
    if not env_dir:
        return None

    path = Path(env_dir) / binary_name(name)
    return str(path) if path.exists() else None


def ffmpeg_from_imageio() -> str | None:
    try:
        import imageio_ffmpeg
    except ImportError:
        return None

    path = Path(imageio_ffmpeg.get_ffmpeg_exe())
    return str(path) if path.exists() else None


def find_binary(name: str) -> str | None:
    env_path = binary_from_env(name)
    if env_path:
        return env_path

    if name == "ffmpeg":
        imageio_path = ffmpeg_from_imageio()
        if imageio_path:
            return imageio_path

    return shutil.which(binary_name(name))


def prepared_binary(name: str, path: str) -> str:
    destination_dir = BUILD_BINARY_DIR / platform_dir()
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / binary_name(name)

    shutil.copy2(path, destination)
    destination.chmod(destination.stat().st_mode | 0o755)
    return str(destination)


def platform_dir() -> str:
    if sys.platform.startswith("win"):
        return "win"
    if sys.platform == "darwin":
        return "mac"
    return "linux"


def add_binary_args(name: str, *, required: bool = False) -> list[str]:
    path = find_binary(name)
    if not path:
        if required:
            raise SystemExit(f"Missing {name}. Install imageio-ffmpeg or set FFMPEG_BIN_DIR.")
        print(f"Skipping optional {name}: not found")
        return []

    bundle_path = prepared_binary(name, path)
    separator = ";" if sys.platform.startswith("win") else ":"
    print(f"Bundling {name}: {path} -> bin/{binary_name(name)}")
    return ["--add-binary", f"{bundle_path}{separator}bin"]


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
        *add_binary_args("ffmpeg", required=True),
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
