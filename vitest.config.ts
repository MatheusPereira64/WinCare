import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes do renderer (lógica em src/lib e componentes com Testing Library).
 * Config própria: o vite.config.ts do Lovable traz TanStack Start/nitro, que
 * não servem para testes. Ver docs/testes.md.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/wincare/**/*.tsx"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      reporter: ["text-summary", "html"],
    },
  },
});
