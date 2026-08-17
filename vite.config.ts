import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  cacheDir: "../node_modules/.vite",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, "src/background.ts"),
        focusUi: resolve(import.meta.dirname, "src/focus-ui.ts"),
        content: resolve(import.meta.dirname, "src/content.ts"),
        options: resolve(import.meta.dirname, "src/options.html"),
        alert: resolve(import.meta.dirname, "src/alert.html")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  test: {
    environment: "node",
    include: ["../tests/**/*.test.ts"]
  }
});
