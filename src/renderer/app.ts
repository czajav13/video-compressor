import "./styles.css";
import {
  CompressionCancelled,
  compressionSummary,
  compressVideoFile,
  CompressionResult,
  CompressionSettings,
  SourceVideoFile,
} from "./compression";
import { formatBytes } from "./format";

type QueueItem = SourceVideoFile & {
  status: "queued" | "running" | "done" | "error" | "canceled";
  progress: number;
  message: string;
};

const state: {
  files: QueueItem[];
  outputDirectory: string | null;
  running: boolean;
  cancelController: AbortController | null;
  results: CompressionResult[];
  theme: "light" | "dark";
} = {
  files: [],
  outputDirectory: null,
  running: false,
  cancelController: null,
  results: [],
  theme: readInitialTheme(),
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app element.");
}

app.innerHTML = `
  <main class="shell">
    <section class="workspace">
      <header class="topbar">
        <div>
          <h1>Video Compressor</h1>
          <p id="status">Add MP4 files to start.</p>
        </div>
        <div class="actions">
          <button id="theme-toggle" class="icon-button" type="button" title="Toggle color theme" aria-label="Toggle color theme">
            <span id="theme-icon" aria-hidden="true"></span>
          </button>
          <button id="add-files" type="button">Add files</button>
          <button id="add-folder" type="button">Add folder</button>
          <button id="clear" type="button">Clear</button>
        </div>
      </header>

      <div class="queue-head">
        <span>File</span>
        <span>Size</span>
        <span>Status</span>
      </div>
      <div id="queue" class="queue"></div>
    </section>

    <aside class="settings">
      <label class="field">
        <span>Output folder</span>
        <div class="folder-row">
          <input id="output-folder" type="text" readonly placeholder="Choose folder" />
          <button id="choose-output" type="button">Choose</button>
        </div>
      </label>

      <label class="field">
        <span>Quality</span>
        <input id="quality" type="range" min="1" max="100" value="55" />
        <output id="quality-value">55</output>
      </label>

      <label class="field">
        <span>Max width</span>
        <select id="max-width">
          <option value="0">Original</option>
          <option value="3840">3840 px</option>
          <option value="2560">2560 px</option>
          <option value="1920" selected>1920 px</option>
          <option value="1280">1280 px</option>
          <option value="854">854 px</option>
        </select>
      </label>

      <div class="progress-block">
        <div class="progress-label">
          <span>Current</span>
          <strong id="current-progress-text">0%</strong>
        </div>
        <progress id="current-progress" max="100" value="0"></progress>
      </div>

      <div class="progress-block">
        <div class="progress-label">
          <span>Total</span>
          <strong id="total-progress-text">0%</strong>
        </div>
        <progress id="total-progress" max="100" value="0"></progress>
      </div>

      <button id="start" class="primary" type="button">Start</button>
      <button id="cancel" type="button" disabled>Cancel</button>

      <div id="results" class="results"></div>
    </aside>
  </main>
`;

const statusEl = getElement<HTMLParagraphElement>("status");
const queueEl = getElement<HTMLDivElement>("queue");
const outputFolderEl = getElement<HTMLInputElement>("output-folder");
const qualityEl = getElement<HTMLInputElement>("quality");
const qualityValueEl = getElement<HTMLOutputElement>("quality-value");
const maxWidthEl = getElement<HTMLSelectElement>("max-width");
const currentProgressEl = getElement<HTMLProgressElement>("current-progress");
const totalProgressEl = getElement<HTMLProgressElement>("total-progress");
const currentProgressTextEl = getElement<HTMLElement>("current-progress-text");
const totalProgressTextEl = getElement<HTMLElement>("total-progress-text");
const startButton = getElement<HTMLButtonElement>("start");
const cancelButton = getElement<HTMLButtonElement>("cancel");
const resultsEl = getElement<HTMLDivElement>("results");
const themeToggleEl = getElement<HTMLButtonElement>("theme-toggle");
const themeIconEl = getElement<HTMLSpanElement>("theme-icon");

applyTheme();

getElement<HTMLButtonElement>("add-files").addEventListener("click", async () => {
  addFiles(
    (await window.compressor.selectMp4Files()).map((file) => ({
      ...file,
      id: `${file.path}:${file.size}`,
      displayPath: file.path,
    })),
  );
});

getElement<HTMLButtonElement>("add-folder").addEventListener("click", async () => {
  addFiles(
    (await window.compressor.selectMp4Folder()).map((file) => ({
      ...file,
      id: `${file.path}:${file.size}`,
      displayPath: file.path,
    })),
  );
});

themeToggleEl.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", state.theme);
  applyTheme();
});

getElement<HTMLButtonElement>("choose-output").addEventListener("click", async () => {
  const directory = await window.compressor.selectOutputDirectory();
  if (directory) {
    state.outputDirectory = directory;
    outputFolderEl.value = directory;
    render();
  }
});

getElement<HTMLButtonElement>("clear").addEventListener("click", () => {
  if (state.running) {
    return;
  }

  state.files = [];
  state.results = [];
  setProgress(0, 0);
  render();
});

qualityEl.addEventListener("input", () => {
  qualityValueEl.value = qualityEl.value;
});

startButton.addEventListener("click", () => {
  void startCompression();
});

cancelButton.addEventListener("click", () => {
  state.cancelController?.abort();
});

render();

function addFiles(files: SourceVideoFile[]): void {
  const existing = new Set(state.files.map((file) => file.id));
  const newFiles = files
    .filter((file) => file.name.toLowerCase().endsWith(".mp4") && !existing.has(file.id))
    .map((file) => ({
      ...file,
      status: "queued" as const,
      progress: 0,
      message: "Queued",
    }));

  state.files.push(...newFiles);
  render();
}

async function startCompression(): Promise<void> {
  if (state.running) {
    return;
  }

  if (!state.files.length) {
    setStatus("Add at least one MP4 file.");
    return;
  }

  if (!state.outputDirectory) {
    setStatus("Choose an output folder.");
    return;
  }

  state.running = true;
  state.cancelController = new AbortController();
  state.results = [];
  state.files = state.files.map((file) => ({
    ...file,
    status: "queued",
    progress: 0,
    message: "Queued",
  }));
  render();

  const settings = readSettings();
  let completed = 0;

  for (const file of state.files) {
    if (state.cancelController.signal.aborted) {
      file.status = "canceled";
      file.message = "Canceled";
      break;
    }

    file.status = "running";
    file.message = "Starting";
    file.progress = 0;
    render();

    try {
      const result = await compressVideoFile({
        file,
        outputDirectory: state.outputDirectory,
        settings,
        signal: state.cancelController.signal,
        onProgress: (progress) => {
          file.progress = progress.fileProgress;
          file.message = progress.message;
          setProgress(progress.fileProgress, (completed + progress.fileProgress) / state.files.length);
          renderQueue();
        },
      });

      completed += 1;
      file.status = "done";
      file.progress = 1;
      file.message = "Done";
      state.results.push(result);
      setStatus(compressionSummary(result));
      setProgress(1, completed / state.files.length);
    } catch (error) {
      if (error instanceof CompressionCancelled) {
        file.status = "canceled";
        file.message = "Canceled";
        setStatus("Canceled.");
        break;
      }

      file.status = "error";
      file.message = errorMessage(error);
      setStatus(file.message);
      break;
    } finally {
      render();
    }
  }

  state.running = false;
  state.cancelController = null;
  render();
}

function readSettings(): CompressionSettings {
  return {
    quality: Number.parseInt(qualityEl.value, 10),
    maxWidth: Number.parseInt(maxWidthEl.value, 10),
  };
}

function render(): void {
  renderQueue();
  renderResults();

  startButton.disabled = state.running;
  cancelButton.disabled = !state.running;

  if (!state.running) {
    if (!state.files.length) {
      setStatus("Add MP4 files to start.");
    } else if (!state.outputDirectory) {
      setStatus(`${state.files.length} file${state.files.length === 1 ? "" : "s"} ready. Choose an output folder.`);
    } else {
      setStatus(`${state.files.length} file${state.files.length === 1 ? "" : "s"} ready.`);
    }
  }
}

function renderQueue(): void {
  if (!state.files.length) {
    queueEl.innerHTML = `<div class="empty">No MP4 files in queue.</div>`;
    return;
  }

  queueEl.innerHTML = state.files
    .map(
      (file) => `
        <div class="queue-row ${file.status}">
          <div class="file-name" title="${escapeHtml(file.displayPath)}">${escapeHtml(file.name)}</div>
          <div>${formatBytes(file.size)}</div>
          <div class="row-status">
            <span>${escapeHtml(file.message)}</span>
            <progress max="100" value="${Math.round(file.progress * 100)}"></progress>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderResults(): void {
  if (!state.results.length) {
    resultsEl.textContent = "";
    return;
  }

  resultsEl.innerHTML = state.results
    .map((result) => `<p title="${escapeHtml(result.outputPath)}">${escapeHtml(compressionSummary(result))}</p>`)
    .join("");
}

function setProgress(current: number, total: number): void {
  const currentPercent = Math.round(current * 100);
  const totalPercent = Math.round(total * 100);
  currentProgressEl.value = currentPercent;
  totalProgressEl.value = totalPercent;
  currentProgressTextEl.textContent = `${currentPercent}%`;
  totalProgressTextEl.textContent = `${totalPercent}%`;
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}.`);
  }
  return element as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readInitialTheme(): "light" | "dark" {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(): void {
  document.documentElement.dataset.theme = state.theme;
  themeIconEl.innerHTML =
    state.theme === "dark"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path></svg>`;
}
