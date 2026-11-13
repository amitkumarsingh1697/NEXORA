import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBrain, indexRepository, openDb, type Db } from '../src/index';
import {
  keyTree,
  MAX_TREE_SYMBOLS,
  readDocHeadings,
  readGradle,
  readJson,
  readToml,
  readXml,
  readYaml,
} from '../src/indexer/extract/structured';

/** A multi-module Java build with Maven and Gradle, Spring XML, JSON, YAML and Markdown. */
const FILES: Record<string, string> = {
  'pom.xml': [
    '<project>',
    '  <groupId>org.acme</groupId>',
    '  <artifactId>parent</artifactId>',
    '  <packaging>pom</packaging>',
    '  <modules><module>core</module><module>web</module></modules>',
    '</project>',
    '',
  ].join('\n'),
  'core/pom.xml': [
    '<project>',
    '  <groupId>org.acme</groupId>',
    '  <artifactId>core</artifactId>',
    '  <dependencies>',
    '    <dependency><groupId>org.slf4j</groupId><artifactId>slf4j-api</artifactId></dependency>',
    '  </dependencies>',
    '</project>',
    '',
  ].join('\n'),
  'web/pom.xml': [
    '<project>',
    '  <groupId>org.acme</groupId>',
    '  <artifactId>web</artifactId>',
    '  <dependencies>',
    '    <dependency>',
    '      <groupId>org.acme</groupId>',
    '      <artifactId>core</artifactId>',
    '    </dependency>',
    '  </dependencies>',
    '  <build><plugins><plugin>',
    '    <groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId>',
    '  </plugin></plugins></build>',
    '  <profiles><profile><id>native</id></profile></profiles>',
    '</project>',
    '',
  ].join('\n'),
  'core/src/main/java/org/acme/core/Store.java': [
    'package org.acme.core;',
    'public class Store {',
    '  public int size() { return 0; }',
    '}',
    '',
  ].join('\n'),
  'web/src/main/resources/beans.xml': [
    '<beans>',
    '  <bean id="store" class="org.acme.core.Store"/>',
    '  <bean id="clock" class="java.time.Clock"/>',
    '</beans>',
    '',
  ].join('\n'),
  'settings.gradle': ["rootProject.name = 'acme'", "include ':app', ':lib'", ''].join('\n'),
  'app/build.gradle.kts': [
    'plugins {',
    '  `java-library`',
    '  id("org.springframework.boot") version "3.2.0"',
    '}',
    'dependencies {',
    '  implementation(project(":lib"))',
    '  implementation("com.google.guava:guava:33.0.0-jre")',
    '  // implementation("com.example:commented-out:1.0")',
    '  api(libs.jackson.databind)',
    '}',
    'tasks.register<Copy>("bundle") {}',
    '',
  ].join('\n'),
  'lib/build.gradle': [
    "plugins { id 'java' }",
    "dependencies { implementation group: 'org.apache.commons', name: 'commons-lang3', version: '3.14.0' }",
    "task hello { doLast { println 'hi' } }",
    '',
  ].join('\n'),
  'package.json': JSON.stringify(
    {
      name: 'acme-web',
      scripts: { build: 'tsc -p .' },
      dependencies: { zod: '3.23.8' },
      devDependencies: { vitest: '2.1.9' },
    },
    null,
    2,
  ),
  'config/database.json': JSON.stringify(
    { db: { url: 'postgres://secret@host/db', pool: { max: 5 } }, features: [{ id: 'a' }] },
    null,
    2,
  ),
  'config/deep.json': JSON.stringify({ a: { b: { c: { d: 1 } } } }),
  'config/settings.yaml': ['server:', '  port: 8080', '  tls:', '    enabled: true', ''].join('\n'),
  'README.md': [
    '# Acme',
    '',
    'See [the design](docs/design.md).',
    '',
    '## Build',
    '',
    'Run `mvn install`.',
    '',
    '### Gradle',
    '',
    'Or Gradle.',
    '',
  ].join('\n'),
  'docs/design.md': ['# Design', '', 'Back to [the readme](../README.md).', ''].join('\n'),
};

let root: string;
let db: Db;
let repoId: number;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-build-config-docs-'));
  for (const [p, body] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  db = openDb(':memory:');
  ({ repoId } = indexRepository(db, root));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const symbols = (file: string) =>
  (
    db
      .prepare(
        "SELECT key, symbol_kind AS kind, start_line AS line FROM nodes WHERE repo_id = ? AND kind = 'symbol' AND file_path = ? ORDER BY start_line, key",
      )
      .all(repoId, file) as { key: string; kind: string; line: number }[]
  ).map((s) => `${s.line} ${s.kind} ${s.key.slice(file.length + 1)}`);
type Edge = { kind: string; src: string; dst: string; confidence: string };
const edgesFrom = (file: string): Edge[] =>
  db
    .prepare(
      `SELECT e.kind, s.key AS src, d.key AS dst, e.confidence FROM edges e
       JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst
       WHERE e.repo_id = ? AND e.evidence_path = ? AND e.kind IN ('references', 'includes', 'mentions')
       ORDER BY e.kind, d.key`,
    )
    .all(repoId, file) as Edge[];
const inventory = (path: string) =>
  db
    .prepare('SELECT status, method, reason FROM file_inventory WHERE repo_id = ? AND path = ?')
    .get(repoId, path) as { status: string; method: string; reason: string | null };

describe('key trees', () => {
  it('reads every key of a JSON file, nested, and never its values', () => {
    const r = readJson('config/database.json', FILES['config/database.json']!, undefined, 'JSON');
    expect(r.level).toBe('full');
    expect(r.method).toBe('JSON parser (every key, nested; values not kept)');
    expect(r.symbols.map((s) => `${s.line} ${s.parent ?? ''}/${s.name}`)).toEqual([
      '2 /db',
      '3 db/url',
      '4 db/pool',
      '5 db.pool/max',
      '8 /features',
      '9 features/[0]',
      '10 features.[0]/id',
    ]);
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('names dependencies and scripts in package.json', () => {
    const r = readJson('package.json', FILES['package.json']!, 'npm-package', 'JSON');
    expect(r.level).toBe('full');
    expect(r.symbols.filter((s) => s.kind !== 'key').map((s) => `${s.kind} ${s.name}`)).toEqual([
      'task build',
      'dependency zod',
      'dependency vitest',
    ]);
  });

  it('marks a file partial, and says so, past the key limit', () => {
    const big = JSON.stringify(
      Object.fromEntries(Array.from({ length: MAX_TREE_SYMBOLS + 5 }, (_, i) => [`k${i}`, i])),
    );
    const r = readJson('big.json', big, undefined, 'JSON');
    expect(r.level).toBe('partial');
    expect(r.symbols).toHaveLength(MAX_TREE_SYMBOLS);
    expect(r.method).toMatch(new RegExp(`first ${MAX_TREE_SYMBOLS} keys`));
  });

  it('reads YAML and TOML keys the same way', () => {
    const y = readYaml('config/settings.yaml', FILES['config/settings.yaml']!, undefined);
    expect(y.level).toBe('full');
    expect(y.symbols.map((s) => `${s.line} ${s.name}`)).toEqual([
      '1 server',
      '2 port',
      '3 tls',
      '4 enabled',
    ]);
    const t = readToml('Cargo.toml', '[package]\nname = "x"\n\n[dependencies]\nserde = "1"\n');
    expect(t.symbols.map((s) => `${s.kind} ${s.name}`)).toContain('dependency serde');
    expect(keyTree([1, 2], '[1,2]', 'json').symbols).toEqual([]);
  });
});

describe('XML', () => {
  it('reads every element of any XML file and links class names to their source', () => {
    const r = readXml('x.xml', '<a><b id="1"><c>org.acme.Thing</c></b><b/></a>', undefined);
    expect(r.level).toBe('full');
    expect(r.symbols.map((s) => `${s.parent ?? ''}/${s.name}`)).toEqual([
      '/a',
      'a/b[1]',
      'a.b[1]/c',
      'a/b',
    ]);
    expect(r.links).toEqual([
      expect.objectContaining({ kind: 'references', target: 'org.acme.Thing', classRef: true }),
    ]);
  });

  it('still reads every dependency of a POM past the element limit, and says the rest was cut', () => {
    const filler = Array.from({ length: MAX_TREE_SYMBOLS }, (_, i) => `<p${i}/>`).join('');
    const r = readXml(
      'pom.xml',
      `<project><artifactId>x</artifactId><properties>${filler}</properties><dependencies><dependency><groupId>g</groupId><artifactId>late</artifactId></dependency></dependencies></project>`,
      'maven',
    );
    expect(r.level).toBe('partial');
    expect(r.method).toMatch(new RegExp(`first ${MAX_TREE_SYMBOLS} elements`));
    expect(r.symbols.filter((s) => s.kind === 'dependency')).toEqual([
      expect.objectContaining({ name: 'g:late', parent: 'project' }),
    ]);
  });

  it('labels a Liquibase changelog full only when the schema reader applies every change', () => {
    const log = (change: string) =>
      `<databaseChangeLog><changeSet id="1" author="a"><createTable tableName="T"><column name="ID" type="INT"/></createTable>${change}</changeSet></databaseChangeLog>`;
    expect(readXml('db.xml', log(''), undefined)).toMatchObject({
      level: 'full',
      method: expect.stringMatching(/every change applied to the schema/),
    });
    expect(
      readXml('db.xml', log('<createIndex tableName="T" indexName="I"/>'), undefined),
    ).toMatchObject({ level: 'partial', method: expect.stringMatching(/createIndex not applied/) });
  });

  it('labels a Hibernate mapping partial: its tables are not read into the schema', () => {
    const r = readXml(
      'Legacy.hbm.xml',
      '<hibernate-mapping><class name="org.acme.Legacy" table="LEGACY"/></hibernate-mapping>',
      undefined,
    );
    expect(r.level).toBe('partial');
    expect(r.method).toMatch(/tables and columns not read into the database schema/);
  });

  it('links a Spring bean to the class it names when the class is in the repository', () => {
    expect(symbols('web/src/main/resources/beans.xml')).toEqual([
      '1 element beans',
      '2 bean beans.bean[store]',
      '3 bean beans.bean[clock]',
    ]);
    expect(edgesFrom('web/src/main/resources/beans.xml')).toEqual([
      {
        kind: 'references',
        src: 'web/src/main/resources/beans.xml#beans.bean[store]',
        dst: 'core/src/main/java/org/acme/core/Store.java#Store',
        confidence: 'inferred',
      },
    ]);
  });
});

describe('Maven', () => {
  it('reads dependencies, plugins and profiles, and links a dependency to the module that builds it', () => {
    expect(symbols('web/pom.xml').filter((s) => !/ element /.test(s))).toEqual([
      '5 dependency project.dependencies.org.acme:core',
      '10 plugin project.build.plugins.org.apache.maven.plugins:maven-surefire-plugin',
      '13 profile project.profiles.profile[native]',
    ]);
    expect(edgesFrom('web/pom.xml')).toEqual([
      {
        kind: 'references',
        src: 'web/pom.xml#project.dependencies.org.acme:core',
        dst: 'core/pom.xml',
        confidence: 'observed',
      },
    ]);
    expect(edgesFrom('pom.xml').map((e) => `${e.kind} ${e.dst}`)).toEqual([
      'includes core/pom.xml',
      'includes web/pom.xml',
    ]);
    expect(inventory('web/pom.xml')).toMatchObject({
      status: 'full',
      method: 'XML element scanner (Maven POM; every element, nested)',
    });
  });
});

describe('Gradle', () => {
  it('reads plugins, dependencies and tasks, and skips commented-out lines', () => {
    expect(symbols('app/build.gradle.kts')).toEqual([
      '2 plugin java-library',
      '3 plugin org.springframework.boot',
      '6 dependency project :lib',
      '7 dependency com.google.guava:guava',
      '9 dependency libs.jackson.databind',
      '11 task bundle',
    ]);
    expect(symbols('lib/build.gradle')).toEqual([
      '1 plugin java',
      '2 dependency org.apache.commons:commons-lang3',
      '3 task hello',
    ]);
    expect(inventory('app/build.gradle.kts').method).toMatch(
      /Full syntax parse .*; Gradle plugins, dependencies and tasks \(patterns\)$/,
    );
  });

  it('links included projects and project dependencies to their build files', () => {
    expect(edgesFrom('settings.gradle').map((e) => `${e.kind} ${e.src} -> ${e.dst}`)).toEqual([
      'includes settings.gradle -> app/build.gradle.kts',
      'includes settings.gradle -> lib/build.gradle',
    ]);
    expect(edgesFrom('app/build.gradle.kts')).toEqual([
      {
        kind: 'references',
        src: 'app/build.gradle.kts#project :lib',
        dst: 'lib/build.gradle',
        confidence: 'inferred',
      },
    ]);
    expect(readGradle('settings.gradle', FILES['settings.gradle']!).facts.rootProject).toBe('acme');
  });
});

describe('Markdown', () => {
  it('records every heading as a nested section and resolves relative links', () => {
    expect(symbols('README.md')).toEqual([
      '1 section Acme',
      '5 section Acme > Build',
      '9 section Acme > Build > Gradle',
    ]);
    expect(edgesFrom('docs/design.md').map((e) => `${e.kind} ${e.dst}`)).toEqual([
      'mentions README.md',
    ]);
    expect(inventory('README.md').status).toBe('full');
  });
});

describe('AsciiDoc and reStructuredText', () => {
  it('nests headings by level and links includes and cross-references', () => {
    const r = readDocHeadings(
      'AsciiDoc',
      [
        '= Guide',
        '',
        '== Install',
        'include::partials/req.adoc[]',
        '',
        '=== Linux',
        '',
        '== Use',
        'See xref:other.adoc[the other guide].',
        '',
      ].join('\n'),
    );
    expect(r.symbols.map((h) => `${h.line} ${h.parent ?? ''}/${h.name}`)).toEqual([
      '1 /Guide',
      '3 Guide/Install',
      '6 Guide.Install/Linux',
      '8 Guide/Use',
    ]);
    expect(r.links.map((l) => `${l.kind} ${l.target}`)).toEqual([
      'includes partials/req.adoc',
      'references other.adoc',
    ]);
    const rst = readDocHeadings('reStructuredText', 'Title\n=====\n\nPart\n----\n\nNext\n====\n');
    expect(rst.symbols.map((h) => `${h.parent ?? ''}/${h.name}`)).toEqual([
      '/Title',
      'Title/Part',
      '/Next',
    ]);
  });
});

describe('architecture brain', () => {
  it('draws build, configuration and documentation files with what they declare', () => {
    const b = buildBrain(db, repoId)!;
    const byName = (name: string, file?: string) =>
      b.neurons.find((n) => n.name === name && (!file || n.file === file));
    for (const f of [
      'pom.xml',
      'package.json',
      'config/database.json',
      'config/settings.yaml',
      'web/src/main/resources/beans.xml',
      'README.md',
      'docs/design.md',
      'settings.gradle',
      'app/build.gradle.kts',
    ])
      expect(
        b.neurons.find((n) => n.kind === 'file' && n.file === f),
        f,
      ).toBeDefined();
    expect(byName('zod')).toMatchObject({ kind: 'dependency', region: 'devops' });
    expect(byName('url', 'config/database.json')).toMatchObject({ kind: 'key' });
    expect(byName('Gradle')).toMatchObject({ kind: 'section', region: 'docs' });
    // Keys deeper than three levels are indexed but not drawn.
    expect(byName('c', 'config/deep.json')).toMatchObject({ kind: 'key' });
    expect(byName('d', 'config/deep.json')).toBeUndefined();
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM nodes WHERE repo_id = ? AND key = 'config/deep.json#a.b.c.d'",
        )
        .get(repoId),
    ).toEqual({ n: 1 });
    expect(b.neurons.find((n) => n.file === 'README.md' && n.kind === 'file')?.region).toBe('docs');
    const bean = byName('bean[store]')!;
    const store = b.neurons.find((n) => n.name === 'Store' && n.kind === 'class')!;
    expect(b.synapses).toContainEqual(
      expect.objectContaining({ source: bean.id, target: store.id, kind: 'references' }),
    );
    const readme = b.neurons.find((n) => n.file === 'README.md' && n.kind === 'file')!;
    const design = b.neurons.find((n) => n.file === 'docs/design.md' && n.kind === 'file')!;
    expect(b.synapses).toContainEqual(
      expect.objectContaining({ source: readme.id, target: design.id, kind: 'references' }),
    );
  });
});
