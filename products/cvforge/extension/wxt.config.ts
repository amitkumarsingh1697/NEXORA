import { defineConfig } from 'wxt';

// The CVForge server the extension talks to. Fixed at build time so the
// extension only needs host permission for that single origin.
const SERVER = process.env.WXT_CVFORGE_URL ?? 'http://localhost:3000';

export default defineConfig({
  // Separate output dir lets e2e build a copy pointed at the test server.
  outDir: process.env.WXT_OUT_DIR ?? '.output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CVForge — Job Capture',
    description: 'Send a job description you are viewing to CVForge, only when you click Extract.',
    // activeTab + scripting: read the current tab only after an explicit click. No content scripts, no <all_urls>.
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: [`${new URL(SERVER).origin}/*`],
    action: { default_title: 'CVForge' },
  },
  vite: () => ({ define: { __CVFORGE_URL__: JSON.stringify(new URL(SERVER).origin) } }),
});
