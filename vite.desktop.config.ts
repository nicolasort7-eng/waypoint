import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const projectRoot = process.cwd();

export default defineConfig({
  root: resolve(projectRoot, "desktop"),
  publicDir: resolve(projectRoot, "public"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, "desktop-dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
