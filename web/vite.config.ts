import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@jtb/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // host: true 让同一局域网内的手机可以直接访问，方便真机调试
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
    fs: {
      // 允许读取 web/ 之外的 shared/ 源码
      allow: [here, fileURLToPath(new URL("../shared", import.meta.url))],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
