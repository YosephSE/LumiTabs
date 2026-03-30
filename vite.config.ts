import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const buildTarget = mode === "firefox" ? "firefox" : "chrome";

  return {
    base: "./",
    plugins: [react()],
    build: {
      outDir: `dist/${buildTarget}`,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          panel: resolve(__dirname, "index.html")
        }
      }
    },
    publicDir: "public"
  };
});