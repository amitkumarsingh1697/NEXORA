import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

/**
 * Bundles the ArchLens inventory script (src/cli/inventory.ts and the registry it uses) into
 * one standalone ES module that needs only Node.js; make-skill-inventory.mjs copies it into
 * skills/archlens/scripts/.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    target: 'node20',
    ssr: 'src/cli/inventory.ts',
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: 'es', entryFileNames: 'inventory.mjs' },
    },
  },
  ssr: { noExternal: true },
});
