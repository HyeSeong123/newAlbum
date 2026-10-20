import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Discover both isolated inference backends before serving pages. Late
  // dependency optimization would reload a page during an active analysis.
  optimizeDeps: { include: ['@tensorflow/tfjs', '@tensorflow/tfjs-backend-wasm', '@tensorflow-models/coco-ssd', '@vladmandic/face-api', '@vladmandic/face-api/dist/face-api.esm-nobundle.js'] },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
    ...(process.env.TAURI_DEV_HOST ? { hmr: { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 5174 } } : {}),
  },
});
