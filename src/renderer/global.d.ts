import { CompressorApi } from "../shared/ipc";

declare global {
  interface Window {
    compressor: CompressorApi;
  }
}

export {};
