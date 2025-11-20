import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: ".",
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
