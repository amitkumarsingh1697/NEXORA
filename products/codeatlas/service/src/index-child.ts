import { indexRepository, openDb } from '@nexora/codeatlas-core';

/** Child process entry: index one repository and report progress over IPC. */
const [dbPath, root] = process.argv.slice(2);
const send = (m: unknown) => process.send?.(m);
try {
  if (!dbPath || !root) throw new Error('usage: index-child <db> <root>');
  const db = openDb(dbPath);
  const report = indexRepository(db, root, {
    onProgress: (message) => send({ type: 'progress', message }),
  });
  db.close();
  send({ type: 'done', report });
  process.exitCode = 0;
} catch (e) {
  send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
}
