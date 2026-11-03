#!/usr/bin/env node
import { indexRepository, openDb, search } from '@nexora/codeatlas-core';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServiceConfig } from './config';
import { createService, listen } from './server';
import { allRegistrars } from './routes';

const [cmd, ...args] = process.argv.slice(2);
const cfg = loadServiceConfig(process.env, {
  webDir:
    process.env.CODEATLAS_WEB_DIR || fileURLToPath(new URL('../../web/dist', import.meta.url)),
});

async function main(): Promise<void> {
  switch (cmd) {
    case 'serve': {
      const { server, ctx } = createService(cfg, allRegistrars);
      const port = await listen(server, cfg.port);
      // The token is shown once, to the person who started the service, in their own terminal.
      process.stdout.write(
        `CodeAtlas is running locally.\nOpen: http://127.0.0.1:${port}/#token=${ctx.token}\nData: ${cfg.home}\nPress Ctrl+C to stop.\n`,
      );
      const stop = () => server.close(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      return;
    }
    case 'index': {
      const root = args[0];
      if (!root) throw new Error('usage: codeatlas index <path>');
      const db = openDb(join(cfg.home, 'codeatlas.db'));
      const report = indexRepository(db, root, {
        onProgress: (m) => process.stderr.write(`… ${m}\n`),
      });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    case 'search': {
      const [repoId, ...q] = args;
      const db = openDb(join(cfg.home, 'codeatlas.db'));
      for (const h of search(db, Number(repoId), q.join(' '), { limit: 10 }))
        process.stdout.write(`${h.filePath}:${h.startLine}-${h.endLine}  ${h.symbolKey ?? ''}\n`);
      return;
    }
    default:
      process.stdout.write('usage: codeatlas <serve|index <path>|search <repoId> <query>>\n');
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
