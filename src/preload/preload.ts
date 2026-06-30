import { contextBridge, ipcRenderer } from "electron";
import { CompressionProgress, CompressionRequest, CompressorApi, IPC_CHANNELS } from "../shared/ipc.js";

const api: CompressorApi = {
  selectMp4Files: () => ipcRenderer.invoke(IPC_CHANNELS.selectMp4Files),
  selectMp4Folder: () => ipcRenderer.invoke(IPC_CHANNELS.selectMp4Folder),
  selectOutputDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.selectOutputDirectory),
  compressFile: (request: CompressionRequest) => ipcRenderer.invoke(IPC_CHANNELS.compressFile, request),
  cancelCompression: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.cancelCompression, jobId),
  onCompressionProgress: (listener: (progress: CompressionProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: CompressionProgress) => listener(progress);
    ipcRenderer.on(IPC_CHANNELS.compressionProgress, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.compressionProgress, handler);
  },
};

contextBridge.exposeInMainWorld("compressor", api);
