from __future__ import annotations

import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PySide6.QtCore import QObject, Qt, QThread, Signal
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)


VIDEO_EXTENSIONS = {".mp4"}
PRESETS = (
    "ultrafast",
    "superfast",
    "veryfast",
    "faster",
    "fast",
    "medium",
    "slow",
    "slower",
    "veryslow",
)
TIME_RE = re.compile(r"time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)")
DURATION_RE = re.compile(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)")


@dataclass(frozen=True)
class CompressionSettings:
    crf: int
    preset: str
    audio_kbps: int
    output_dir: Path


@dataclass(frozen=True)
class WorkItem:
    input_path: Path
    output_path: Path


def app_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def platform_name() -> str:
    if sys.platform.startswith("win"):
        return "win"
    if sys.platform == "darwin":
        return "mac"
    return "linux"


def executable_name(name: str) -> str:
    return f"{name}.exe" if sys.platform.startswith("win") else name


def find_tool(name: str) -> str | None:
    binary = executable_name(name)
    bundle_dir = Path(getattr(sys, "_MEIPASS", app_base_dir()))
    candidates = [
        app_base_dir() / "ffmpeg" / platform_name() / binary,
        app_base_dir() / "bin" / binary,
        bundle_dir / "ffmpeg" / platform_name() / binary,
        bundle_dir / "bin" / binary,
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return shutil.which(binary)


def seconds_from_match(match: re.Match[str]) -> float:
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def unique_output_path(output_dir: Path, input_path: Path) -> Path:
    output_path = output_dir / input_path.name
    if not output_path.exists():
        return output_path

    counter = 1
    while True:
        candidate = output_dir / f"{input_path.stem}_compressed_{counter}{input_path.suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def file_size(path: Path) -> str:
    size = path.stat().st_size
    units = ("B", "KB", "MB", "GB", "TB")
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} {unit}"
        value /= 1024
    return f"{size} B"


class CompressionWorker(QObject):
    status = Signal(str)
    current_progress = Signal(float)
    total_progress = Signal(float)
    error = Signal(str)
    finished = Signal(str)

    def __init__(
        self,
        work_items: list[WorkItem],
        settings: CompressionSettings,
        ffmpeg_path: str,
        ffprobe_path: str | None,
    ) -> None:
        super().__init__()
        self.work_items = work_items
        self.settings = settings
        self.ffmpeg_path = ffmpeg_path
        self.ffprobe_path = ffprobe_path
        self.process: subprocess.Popen[str] | None = None
        self.cancel_requested = False

    def cancel(self) -> None:
        self.cancel_requested = True
        if self.process and self.process.poll() is None:
            self.process.terminate()

    def run(self) -> None:
        total = len(self.work_items)
        completed = 0

        for index, item in enumerate(self.work_items, start=1):
            if self.cancel_requested:
                break

            self.status.emit(f"Compressing {index}/{total}: {item.input_path.name}")
            duration = self.probe_duration(item.input_path)
            result = self.compress_one(item, duration, index, total)
            if result != 0:
                if self.cancel_requested:
                    break
                self.error.emit(f"ffmpeg exited with code {result}: {item.input_path.name}")
                return

            completed += 1
            self.current_progress.emit(100.0)
            self.total_progress.emit(completed / total * 100)

        if self.cancel_requested:
            self.finished.emit(f"Canceled. Completed {completed}/{total}.")
        else:
            self.finished.emit(f"Done. Compressed {completed}/{total} files.")

    def probe_duration(self, input_path: Path) -> float | None:
        if not self.ffprobe_path:
            return None

        command = [
            self.ffprobe_path,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(input_path),
        ]
        try:
            completed = subprocess.run(command, capture_output=True, text=True, check=False)
            return float(completed.stdout.strip())
        except (OSError, ValueError):
            return None

    def compress_one(self, item: WorkItem, duration: float | None, index: int, total: int) -> int:
        command = [
            self.ffmpeg_path,
            "-y",
            "-i",
            str(item.input_path),
            "-c:v",
            "libx264",
            "-crf",
            str(self.settings.crf),
            "-preset",
            self.settings.preset,
            "-c:a",
            "aac",
            "-b:a",
            f"{self.settings.audio_kbps}k",
            str(item.output_path),
        ]

        try:
            self.process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                universal_newlines=True,
            )
        except OSError as exc:
            self.error.emit(f"Could not start ffmpeg: {exc}")
            return 1

        assert self.process.stderr is not None
        for line in self.process.stderr:
            if duration is None:
                duration_match = DURATION_RE.search(line)
                if duration_match:
                    duration = seconds_from_match(duration_match)

            time_match = TIME_RE.search(line)
            if time_match and duration and duration > 0:
                elapsed = seconds_from_match(time_match)
                current = min(100.0, elapsed / duration * 100)
                total_progress = ((index - 1) + current / 100) / total * 100
                self.current_progress.emit(current)
                self.total_progress.emit(total_progress)

        return self.process.wait()


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Video Compressor")
        self.resize(980, 620)

        self.ffmpeg_path = find_tool("ffmpeg")
        self.ffprobe_path = find_tool("ffprobe")
        self.files: list[Path] = []
        self.thread: QThread | None = None
        self.worker: CompressionWorker | None = None

        self.create_widgets()
        self.set_running(False)
        self.set_status(self.initial_status())

    def initial_status(self) -> str:
        if self.ffmpeg_path:
            return "Ready. Add MP4 files or a folder."
        return "ffmpeg was not found. Add ffmpeg to PATH or to the application folder."

    def create_widgets(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)

        toolbar = QHBoxLayout()
        layout.addLayout(toolbar)

        self.add_files_button = QPushButton("Add files")
        self.add_files_button.clicked.connect(self.add_files)
        toolbar.addWidget(self.add_files_button)

        self.add_folder_button = QPushButton("Add folder")
        self.add_folder_button.clicked.connect(self.add_folder)
        toolbar.addWidget(self.add_folder_button)

        self.clear_button = QPushButton("Clear")
        self.clear_button.clicked.connect(self.clear_files)
        toolbar.addWidget(self.clear_button)

        toolbar.addStretch(1)

        self.start_button = QPushButton("START")
        self.start_button.clicked.connect(self.start_compression)
        toolbar.addWidget(self.start_button)

        self.cancel_button = QPushButton("Cancel")
        self.cancel_button.clicked.connect(self.cancel_compression)
        toolbar.addWidget(self.cancel_button)

        content = QHBoxLayout()
        layout.addLayout(content, 1)

        self.table = QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["File", "Size", "Path"])
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        content.addWidget(self.table, 1)

        settings_panel = QWidget()
        settings_panel.setFixedWidth(280)
        settings_layout = QVBoxLayout(settings_panel)
        settings_form = QFormLayout()
        settings_layout.addLayout(settings_form)

        self.crf_input = QSpinBox()
        self.crf_input.setRange(0, 51)
        self.crf_input.setValue(30)
        settings_form.addRow("CRF", self.crf_input)

        self.preset_input = QComboBox()
        self.preset_input.addItems(PRESETS)
        self.preset_input.setCurrentText("veryfast")
        settings_form.addRow("Preset", self.preset_input)

        self.audio_input = QSpinBox()
        self.audio_input.setRange(32, 320)
        self.audio_input.setSingleStep(16)
        self.audio_input.setValue(96)
        settings_form.addRow("Audio kbps", self.audio_input)

        output_row = QHBoxLayout()
        self.output_input = QLineEdit(str(Path.cwd() / "compressed"))
        output_button = QPushButton("...")
        output_button.setFixedWidth(36)
        output_button.clicked.connect(self.choose_output_dir)
        output_row.addWidget(self.output_input, 1)
        output_row.addWidget(output_button)
        settings_form.addRow("Output", output_row)

        hint = QLabel("Default: libx264, CRF 30, veryfast, AAC 96k.")
        hint.setWordWrap(True)
        settings_layout.addWidget(hint)
        settings_layout.addStretch(1)
        content.addWidget(settings_panel)

        self.status_label = QLabel()
        layout.addWidget(self.status_label)

        self.current_progress = QProgressBar()
        self.current_progress.setRange(0, 100)
        layout.addWidget(QLabel("Current file"))
        layout.addWidget(self.current_progress)

        self.total_progress = QProgressBar()
        self.total_progress.setRange(0, 100)
        layout.addWidget(QLabel("Full queue"))
        layout.addWidget(self.total_progress)

    def set_status(self, text: str) -> None:
        self.status_label.setText(text)

    def set_running(self, running: bool) -> None:
        self.start_button.setEnabled(not running)
        self.cancel_button.setEnabled(running)
        self.add_files_button.setEnabled(not running)
        self.add_folder_button.setEnabled(not running)
        self.clear_button.setEnabled(not running)

    def add_files(self) -> None:
        paths, _ = QFileDialog.getOpenFileNames(self, "Select MP4 files", "", "MP4 video (*.mp4);;All files (*)")
        self.add_paths([Path(path) for path in paths])

    def add_folder(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "Select a folder with MP4 files")
        if folder:
            self.add_paths(sorted(Path(folder).glob("*.mp4")))

    def add_paths(self, paths: list[Path]) -> None:
        known = {path.resolve() for path in self.files}
        added = 0

        for path in paths:
            file_path = path.resolve()
            if file_path.suffix.lower() not in VIDEO_EXTENSIONS or not file_path.is_file():
                continue
            if file_path in known:
                continue

            self.files.append(file_path)
            known.add(file_path)
            row = self.table.rowCount()
            self.table.insertRow(row)
            self.table.setItem(row, 0, QTableWidgetItem(file_path.name))
            self.table.setItem(row, 1, QTableWidgetItem(file_size(file_path)))
            self.table.setItem(row, 2, QTableWidgetItem(str(file_path.parent)))
            added += 1

        if added:
            self.set_status(f"Added files: {added}. In queue: {len(self.files)}.")

    def clear_files(self) -> None:
        self.files.clear()
        self.table.setRowCount(0)
        self.current_progress.setValue(0)
        self.total_progress.setValue(0)
        self.set_status(self.initial_status())

    def choose_output_dir(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "Select output folder")
        if folder:
            self.output_input.setText(folder)

    def read_settings(self) -> CompressionSettings:
        return CompressionSettings(
            crf=self.crf_input.value(),
            preset=self.preset_input.currentText(),
            audio_kbps=self.audio_input.value(),
            output_dir=Path(self.output_input.text()).expanduser().resolve(),
        )

    def start_compression(self) -> None:
        if not self.ffmpeg_path:
            QMessageBox.critical(
                self,
                "Missing ffmpeg",
                "ffmpeg was not found. Install ffmpeg on your system or add the binary to the application folder.",
            )
            return

        if not self.files:
            QMessageBox.information(self, "No files", "Add at least one MP4 file.")
            return

        settings = self.read_settings()
        settings.output_dir.mkdir(parents=True, exist_ok=True)
        work_items = [WorkItem(path, unique_output_path(settings.output_dir, path)) for path in self.files]

        self.current_progress.setValue(0)
        self.total_progress.setValue(0)
        self.set_running(True)

        self.thread = QThread()
        self.worker = CompressionWorker(work_items, settings, self.ffmpeg_path, self.ffprobe_path)
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)
        self.worker.status.connect(self.set_status)
        self.worker.current_progress.connect(lambda value: self.current_progress.setValue(int(value)))
        self.worker.total_progress.connect(lambda value: self.total_progress.setValue(int(value)))
        self.worker.error.connect(self.handle_error)
        self.worker.finished.connect(self.handle_finished)
        self.worker.finished.connect(self.thread.quit)
        self.worker.finished.connect(self.worker.deleteLater)
        self.thread.finished.connect(self.thread.deleteLater)
        self.thread.start()

    def cancel_compression(self) -> None:
        if self.worker:
            self.worker.cancel()
            self.set_status("Canceling...")

    def handle_error(self, message: str) -> None:
        self.set_running(False)
        self.set_status(message)
        QMessageBox.critical(self, "Compression error", message)
        if self.thread:
            self.thread.quit()

    def handle_finished(self, message: str) -> None:
        self.set_running(False)
        self.set_status(message)
        self.worker = None
        self.thread = None

    def closeEvent(self, event) -> None:  # type: ignore[no-untyped-def]
        if self.worker:
            self.worker.cancel()
        event.accept()


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("Video Compressor")
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
