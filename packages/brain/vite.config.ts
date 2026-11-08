import { defineConfig } from 'vite';

/** Builds the standalone viewer as one script, which make-template.mjs inlines into a page. */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: 'src/standalone.ts',
      name: 'NexoraBrain',
      formats: ['iife'],
      fileName: () => 'brain-viewer.js',
    },
  },
});
