import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const SERVICE = process.env.CODEATLAS_SERVICE ?? 'http://127.0.0.1:4317';

export default defineConfig({
  plugins: [react(), tailwind()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: SERVICE,
        changeOrigin: true,
        // The service rejects foreign origins; the dev proxy is same-machine, so drop the dev-server origin.
        configure: (proxy) => proxy.on('proxyReq', (req) => req.removeHeader('origin')),
      },
    },
  },
});
