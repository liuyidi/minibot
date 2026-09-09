import { defineConfig } from "vite";
import path from "node:path";

/**
 * Standalone build for ``minibot/webui/vendor/syntax-highlight/<rshVersion>/``.
 * React is aliased to window bridges so the host SPA and this bundle share one React.
 *
 * Usage:
 *   npx vite build --config vite.syntax-vendor.config.ts
 */
export default defineConfig({
  // Relative chunk URLs resolve against the module's CDN URL.
  base: "./",
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: path.resolve(__dirname, "src/vendor/react-bridge.ts"),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: path.resolve(__dirname, "src/vendor/jsx-runtime-bridge.ts"),
      },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "vendor-dist/syntax-highlight"),
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.resolve(__dirname, "src/vendor/syntax-highlight-entry.ts"),
      formats: ["es"],
      fileName: () => "syntax-highlight.js",
    },
    rollupOptions: {
      output: {
        // Keep entry name stable; async lang/shared chunks may be content-hashed.
        entryFileNames: "syntax-highlight.js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
