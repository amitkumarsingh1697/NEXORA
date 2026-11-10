import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateBrain, type BrainModel } from '@nexora/brain';
import { buildBrain, indexRepository, openDb } from '../src/index';
import { discoverFiles } from '../src/indexer/files';

/**
 * A small repository shaped like the ArchLens QA target (Keycloak): a Java server with a
 * Liquibase schema and JPA entities, a React console whose HTTP client lives in src/api/,
 * and real files tracked under a folder named dist/.
 */
const FILES: Record<string, string> = {
  'server/src/main/java/org/acme/TokenEndpoint.java':
    'package org.acme;\npublic class TokenEndpoint {\n  public String token() { return "t"; }\n}\n',
  'server/src/main/java/org/acme/RealmResource.java':
    'package org.acme;\npublic class RealmResource {}\n',
  'server/src/main/java/org/acme/UserEntity.java':
    'package org.acme;\nimport jakarta.persistence.Entity;\n@Entity\npublic class UserEntity {}\n',
  'server/src/main/resources/META-INF/jpa-changelog-1.0.xml':
    '<databaseChangeLog><changeSet id="1"><createTable tableName="USER_ENTITY"/></changeSet></databaseChangeLog>\n',
  // A test fixture schema must not be counted as the product's schema.
  'testsuite/providers/src/main/resources/META-INF/example-changelog.xml':
    '<databaseChangeLog></databaseChangeLog>\n',
  // A mapping format the brain does not read (Hibernate XML).
  'server/src/main/resources/Legacy.hbm.xml':
    '<hibernate-mapping><class name="org.acme.Legacy" table="LEGACY"/></hibernate-mapping>\n',
  'server/dist/bin/run.sh': '#!/bin/sh\njava -jar server.jar\n',
  'console/package.json': JSON.stringify({ name: 'console', dependencies: { react: '^18.3.1' } }),
  'console/src/api/request.ts':
    'export async function request(path: string): Promise<Response> {\n  return fetch(path);\n}\n',
  'console/src/App.tsx':
    "import { request } from './api/request';\nexport function App() {\n  void request('/x');\n  return null;\n}\n",
};

let root: string;
let brain: BrainModel;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-mixed-'));
  for (const [p, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args],
      {
        stdio: 'ignore',
      },
    );
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  const db = openDb(':memory:');
  const { repoId } = indexRepository(db, root);
  const b = buildBrain(db, repoId);
  if (!b) throw new Error('no brain');
  brain = b;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('brain coverage on a mixed-language repository', () => {
  it('says on the model how each file was processed, and never claims it all (QA AL-01)', () => {
    expect(brain.coverage?.partial).toBe(true);
    // Counts from the inventory: 10 tracked files. The Java files parse completely with the Java
    // grammar (full); the two Liquibase changelogs and the Hibernate mapping are partially read.
    expect(brain.coverage?.summary).toBe(
      '10 files found, 6 fully analysed, 3 partially analysed, 0 text only, 1 excluded, 0 binary. 100% of readable files were analysed (66.7% fully).',
    );
    expect(brain.coverage?.gaps.join(' ')).toMatch(/3 files are partially analysed/);
    const inv = brain.coverage?.inventory;
    expect(inv?.languages.find((l) => l.language === 'Java')).toMatchObject({
      files: 3,
      analysed: 3,
      status: 'full',
      method: expect.stringMatching(/^Full syntax parse \(tree-sitter tree-sitter-java@/),
    });
    expect(inv?.notAnalysed.find((f) => f.path === 'server/dist/bin/run.sh')).toMatchObject({
      status: 'excluded',
      reason: 'in a build-output or dependency folder',
    });
    // Java classes from the full parse are drawn with their members, parameters and returns.
    const token = brain.neurons.find((n) => n.name === 'TokenEndpoint');
    expect(token).toMatchObject({ kind: 'class', region: 'backend', line: 2 });
    expect(token?.signature).toBe('public class TokenEndpoint');
    const method = brain.neurons.find((n) => n.name === 'TokenEndpoint.token');
    expect(method).toMatchObject({
      kind: 'method',
      parent: token?.id,
      returns: 'String',
      returnsDeclared: true,
      params: [],
    });
    // It survives the page's validation unchanged.
    const r = validateBrain(JSON.parse(JSON.stringify(brain)));
    expect(r.ok && r.model.coverage).toEqual(brain.coverage);
  });

  it('draws Liquibase and JPA schemas, and names the sources it cannot read (QA AL-04)', () => {
    // The Liquibase table, and the JPA entity matched to it by its snake_case name.
    const table = brain.neurons.find((n) => n.kind === 'table' && n.name === 'USER_ENTITY');
    expect(table).toMatchObject({ region: 'database' });
    const entity = brain.neurons.find((n) => n.name === 'UserEntity');
    expect(
      brain.synapses.find((s) => s.source === entity?.id && s.target === table?.id),
    ).toMatchObject({ kind: 'maps_to', confidence: 'inferred' });
    expect(table?.details).toContainEqual({
      label: 'Defined by',
      value: 'Liquibase migration (server/src/main/resources/META-INF/jpa-changelog-1.0.xml:1)',
    });
    expect(brain.coverage?.unreadSchemas).toMatch(/1 Hibernate XML mappings/);
    expect(brain.coverage?.unreadSchemas).not.toMatch(/Liquibase|@Entity/);
  });

  it('reports tracked files dropped because of their folder name (QA AL-05)', () => {
    const d = discoverFiles(root);
    expect(d.skipped).toContainEqual({ path: 'server/dist/bin/run.sh', reason: 'ignored_dir' });
    expect(brain.coverage?.gaps.join(' ')).toMatch(
      /1 files tracked by git in folders named dist\//,
    );
  });

  it("places a React app's src/api/ client in Frontend, not Backend (QA AL-03)", () => {
    const req = brain.neurons.find((n) => n.name === 'request');
    expect(req).toMatchObject({ region: 'frontend' });
    expect(req?.regionReason).toMatch(/depends on react/);
  });
});
