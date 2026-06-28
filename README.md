# Video Compressor

Prosta aplikacja GUI do batchowej kompresji plikow MP4 przez `ffmpeg`.
Domyslne ustawienia odpowiadaja `skrypt.sh`:

```bash
ffmpeg -y -i input.mp4 -c:v libx264 -crf 30 -preset veryfast -c:a aac -b:a 96k output.mp4
```

## Uruchomienie developerskie

Wymagania:

- Python 3.10+
- zaleznosci z `requirements.txt`
- `ffmpeg` i najlepiej `ffprobe` w `PATH`

```bash
python -m pip install -r requirements.txt
python main.py
```

## Bundlowanie ffmpeg

Aplikacja szuka binarek w tej kolejnosci:

1. `ffmpeg/<platforma>/ffmpeg`
2. `bin/ffmpeg`
3. systemowy `PATH`

Na Windows nazwa binarki to `ffmpeg.exe`.

Przykladowa struktura:

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

## Build aplikacji

Najprostsza sciezka to PyInstaller:

```bash
pip install -r requirements.txt
python build.py
```

`build.py` automatycznie bundluje `ffmpeg` i `ffprobe`, jesli znajdzie je w `PATH`.
Mozesz tez dodac folder recznie jako dane aplikacji.

Linux/macOS:

```bash
pyinstaller --noconfirm --windowed --name VideoCompressor --add-data "ffmpeg:ffmpeg" main.py
```

Windows:

```powershell
pyinstaller --noconfirm --windowed --name VideoCompressor --add-data "ffmpeg;ffmpeg" main.py
```

Wynik znajdziesz w `dist/VideoCompressor`.

## Build Windows/macOS/Linux w CI

Workflow `.github/workflows/build.yml` buduje artefakty na natywnych runnerach:

- Linux na `ubuntu-latest`
- Windows na `windows-latest`
- macOS na `macos-latest`

To jest w praktyce najpewniejsza metoda, bo PyInstaller nie robi pelnego cross-builda macOS/Windows z Linuksa.
