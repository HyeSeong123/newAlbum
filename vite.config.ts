import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
    ...(process.env.TAURI_DEV_HOST ? { hmr: { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 5174 } } : {}),
  },
});
