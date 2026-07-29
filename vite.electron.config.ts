import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Build used for the Electron desktop shell (client-only SPA, loaded via file://).
 * Usage: npx vite build --config vite.electron.config.ts
 */
export default defineConfig({
  base: "./",
  root: "electron/renderer",
  plugins: [react(), tailwindcss(), tsConfigPaths({ root: import.meta.dirname })],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
