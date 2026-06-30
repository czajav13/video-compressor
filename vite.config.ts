import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/release/**", "**/dist-electron/**", "**/dist-renderer/**"],
    },
  },
});
