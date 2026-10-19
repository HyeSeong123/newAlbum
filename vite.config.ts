import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const nativeMode = process.env.VITE_AI_ENGINE !== "legacy";
const legacyClients = ["people", "pets"].map(domain => path.join(root, `src/features/${domain}/engine/client`));

export default defineConfig({
  plugins: [react(), {
    name: 'native-ai-client-boundary', enforce: 'pre',
    resolveId(source, importer) {
      if (!nativeMode) return null;
      const clean = source.split('?')[0];
      const file = clean.startsWith('/src/') ? path.join(root, clean.slice(1)) : path.isAbsolute(clean) ? clean : clean.startsWith('.') && importer ? path.resolve(path.dirname(importer.split('?')[0]), clean) : null;
      if (file && legacyClients.includes(file.replace(/\.ts$/, ''))) return path.join(root, 'src/features/ai/native/unavailableClients.ts');
      return null;
    },
  }],
  // Discover both isolated inference backends before serving pages. Late
  // dependency optimization would reload a page during an active analysis.
  optimizeDeps: { include: nativeMode ? [] : ['@tensorflow/tfjs', '@tensorflow/tfjs-backend-wasm', '@tensorflow-models/coco-ssd', '@vladmandic/face-api', '@vladmandic/face-api/dist/face-api.esm-nobundle.js', 'onnxruntime-web/wasm'] },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
    ...(process.env.TAURI_DEV_HOST ? { hmr: { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 5174 } } : {}),
  },
});
