import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), {
    name: 'manual-product-no-inference',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const file of Object.keys(chunk.modules)) {
          const id = file.replaceAll('\\', '/');
          if (/\/node_modules\/(?:@tensorflow\/|@tensorflow-models\/|@vladmandic\/face-api\/|onnxruntime-web\/)/.test(id)
              || /\/src\/features\/(?:ai\/|people\/engine\/|pets\/engine\/|people\/faceService\.ts|pets\/usePetAnalysis\.ts)/.test(id)) {
            this.error(`Inference code cannot enter a manual-only product: ${id}`);
          }
        }
      }
    },
  }],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
    ...(process.env.TAURI_DEV_HOST ? { hmr: { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 5174 } } : {}),
  },
});
