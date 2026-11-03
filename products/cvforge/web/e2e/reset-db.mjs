// Recreate the E2E database and apply migrations before the web server starts.
import { execSync } from 'node:child_process';

const url =
  process.env.E2E_DATABASE_URL ?? 'postgres://nexora:nexora_dev@127.0.0.1:5432/cvforge_e2e';
const admin = url.replace(/\/[^/]+$/, '/postgres');
const name = new URL(url).pathname.slice(1);
execSync(
  `psql "${admin}" -c "DROP DATABASE IF EXISTS ${name} WITH (FORCE)" -c "CREATE DATABASE ${name}"`,
  { stdio: 'inherit' },
);
execSync('pnpm --filter @nexora/cvforge-backend db:migrate', {
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'inherit',
});
