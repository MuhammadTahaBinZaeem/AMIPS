import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
  // Use relative asset paths so the bundled renderer can be loaded via file://
  // inside the Electron shell without breaking script/style references.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "../src"),
    },
  },
});
