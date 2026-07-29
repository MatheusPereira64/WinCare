import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Build used for the Electron desktop shell (client-only SPA, loaded via file://).
 * Usage: npx vite build --config vite.electron.config.ts
 */
export default defineConfig({
  base: "./",
  root: "electron/renderer",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});

