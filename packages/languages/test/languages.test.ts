import { describe, expect, it } from 'vitest';
import {
  EXTRA_EXT,
  EXTRA_FILENAME,
  HEURISTICS,
  LANGUAGES,
  PREFERRED,
  analyserOf,
  checkInventory,
  classify,
  coverageSentence,
  languageInfo,
  overrideNames,
  roleOf,
  summarize,
  type FileRecord,
} from '../src/index';

const enc = (s: string) => new TextEncoder().encode(s);
const c = (path: string, text?: string) =>
  classify({ path, head: text === undefined ? null : enc(text) });

describe('registry', () => {
  it('knows the full Linguist catalogue, not a short list', () => {
    expect(LANGUAGES.length).toBeGreaterThan(800);
  });
  it('every name used by an override, default or heuristic exists (no typo can hide a language)', () => {
    const names = new Set(LANGUAGES.map((l) => l.name));
    const used = [
      ...overrideNames(),
      ...Object.values(PREFERRED),
      ...Object.values(EXTRA_EXT),
      ...Object.values(EXTRA_FILENAME),
      ...Object.values(HEURISTICS).flatMap((h) => h.map(([n]) => n)),
    ];
    expect(used.filter((n) => !names.has(n))).toEqual([]);
  });
  it('assigns the user-facing categories', () => {
    expect(languageInfo('Shell')?.category).toBe('scripting');
    expect(languageInfo('PLSQL')?.category).toBe('database');
    expect(languageInfo('HCL')?.category).toBe('infrastructure');
    expect(languageInfo('Protocol Buffer')?.category).toBe('api');
    expect(languageInfo('Maven POM')?.category).toBe('build');
    expect(languageInfo('YAML')?.category).toBe('config');
    expect(languageInfo('Markdown')?.category).toBe('docs');
    expect(languageInfo('COBOL')?.category).toBe('programming');
  });
  it('maps languages to analysers, and everything else to text', () => {
    expect(analyserOf('TypeScript')).toBe('ts-compiler');
    expect(analyserOf('Java')).toBe('declarations');
    expect(analyserOf('COBOL')).toBe('declarations');
    expect(analyserOf('YAML')).toBe('yaml');
    expect(analyserOf('Brainfuck')).toBe('text');
    expect(analyserOf('Not a language')).toBe('text');
  });
});

describe('classify', () => {
  it.each([
    ['src/a.ts', 'TypeScript'],
    ['src/A.tsx', 'TSX'],
    ['x.py', 'Python'],
    ['Main.java', 'Java'],
    ['build.gradle.kts', 'Gradle Kotlin DSL'],
    ['build.gradle', 'Gradle'],
    ['a.kt', 'Kotlin'],
    ['a.scala', 'Scala'],
    ['a.groovy', 'Groovy'],
    ['a.go', 'Go'],
    ['lib.rs', 'Rust'],
    ['a.cpp', 'C++'],
    ['a.c', 'C'],
    ['a.fsx', 'F#'],
    ['a.swift', 'Swift'],
    ['a.dart', 'Dart'],
    ['a.jl', 'Julia'],
    ['a.lua', 'Lua'],
    ['a.exs', 'Elixir'],
    ['a.erl', 'Erlang'],
    ['a.hs', 'Haskell'],
    ['a.clj', 'Clojure'],
    ['a.f90', 'Fortran Free Form'],
    ['a.cob', 'COBOL'],
    ['a.jcl', 'JCL'],
    ['a.ps1', 'PowerShell'],
    ['a.fish', 'fish'],
    ['a.graphql', 'GraphQL'],
    ['a.proto', 'Protocol Buffer'],
    ['a.thrift', 'Thrift'],
    ['main.tf', 'HCL'],
    ['a.nix', 'Nix'],
    ['CMakeLists.txt', 'CMake'],
    ['Makefile', 'Makefile'],
    ['Dockerfile', 'Dockerfile'],
    ['Dockerfile.prod', 'Dockerfile'],
    ['pom.xml', 'Maven POM'],
    ['.bashrc', 'Shell'],
    ['Gemfile', 'Ruby'],
    ['Jenkinsfile', 'Groovy'],
    ['go.mod', 'Go Module'],
    ['a.toml', 'TOML'],
    ['a.ini', 'INI'],
    ['a.xml', 'XML'],
    ['a.yaml', 'YAML'],
    ['a.md', 'Markdown'],
    ['a.rst', 'reStructuredText'],
    ['nb.ipynb', 'Jupyter Notebook'],
    ['.gitignore', 'Ignore List'],
    ['.editorconfig', 'EditorConfig'],
  ])('%s is %s', (path, lang) => {
    expect(c(path, 'x\n').language).toBe(lang);
  });

  it('reads shebangs in extensionless scripts, including env and versioned interpreters', () => {
    expect(c('bin/deploy', '#!/usr/bin/env python3\nprint(1)\n')).toMatchObject({
      language: 'Python',
      detectedBy: 'shebang',
    });
    expect(c('bin/run', '#!/bin/bash\necho\n').language).toBe('Shell');
    expect(c('bin/x', '#!/usr/bin/env -S node --no-warnings\n').language).toBe('JavaScript');
    expect(c('bin/y', '#!/usr/bin/perl -w\n').language).toBe('Perl');
    expect(c('bin/z', '#!/usr/bin/env ruby2.7\n').language).toBe('Ruby');
    expect(c('bin/q', '#!/usr/bin/env some-unknown-tool\n').language).toBe(
      'Script (some-unknown-tool)',
    );
  });
  it('reads vim and emacs modelines', () => {
    expect(c('conf/thing', 'x = 1\n-- vim: set ft=lua:\n')).toMatchObject({
      language: 'Lua',
      detectedBy: 'modeline',
    });
    expect(c('conf/other', '# -*- mode: ruby -*-\nx\n').language).toBe('Ruby');
  });
  it('disambiguates shared extensions by content and says it was a heuristic', () => {
    expect(c('a.h', '@interface Foo : NSObject\n@end\n')).toMatchObject({
      language: 'Objective-C',
      confidence: 'inferred',
    });
    expect(c('a.h', 'namespace x { class Y {}; }\n').language).toBe('C++');
    const plain = c('a.h', 'int f(void);\n');
    expect(plain.language).toBe('C');
    expect(plain.confidence).toBe('inferred');
    expect(plain.alternatives).toEqual(expect.arrayContaining(['C++', 'Objective-C']));
    expect(c('q.sql', 'CREATE OR REPLACE PACKAGE p AS\nEND p;\n/\n').language).toBe('PLSQL');
    expect(c('q.sql', 'CREATE PROC dbo.x AS SELECT 1\nGO\n').language).toBe('TSQL');
    expect(c('q.sql', 'CREATE TABLE t (id int);\n').language).toBe('SQL');
    expect(c('m.m', 'function y = f(x)\n  y = x;\nend\n').language).toBe('MATLAB');
    expect(c('t.ts', '<?xml version="1.0"?><TS></TS>').language).toBe('XML');
  });
  it('detects content of extensionless data files', () => {
    expect(c('data/thing', '<?xml version="1.0"?><a/>').language).toBe('XML');
    expect(c('data/conf', '{"a": 1}').language).toBe('JSON');
  });
  it('detects binary by magic bytes and NUL bytes, and by extension when the content was not read', () => {
    const png = classify({
      path: 'logo.png',
      head: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]),
    });
    expect(png).toMatchObject({ category: 'binary', binaryKind: 'PNG image' });
    expect(classify({ path: 'x.dat', head: new Uint8Array([1, 2, 0, 3]) }).category).toBe('binary');
    expect(classify({ path: 'lib/a.jar', head: null }).category).toBe('binary');
    // A binary file with a source extension is still binary.
    expect(
      classify({ path: 'Weird.java', head: new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0, 0]) })
        .category,
    ).toBe('binary');
  });
  it('reads UTF-16 with a BOM as text, not binary', () => {
    const s = 'SELECT 1;\n';
    const buf = new Uint8Array(2 + s.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < s.length; i++) buf[2 + i * 2] = s.charCodeAt(i);
    expect(classify({ path: 'q.sql', head: buf })).toMatchObject({
      language: 'SQL',
      encoding: 'utf-16le',
    });
  });
  it('recognises Git LFS pointers', () => {
    expect(
      c('big.psd', 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n'),
    ).toMatchObject({
      language: 'Git LFS pointer',
      lfsPointer: true,
    });
  });
  it('never drops an unknown file: it is classified as unrecognised with its extension', () => {
    expect(c('notes/thing.zzqx', 'hello\n')).toMatchObject({
      language: 'Unrecognised (.zzqx)',
      category: 'unknown',
    });
    expect(c('LICENSE_EXTRA_WEIRD', 'hello\n').language).toBe('Unrecognised (no extension)');
  });
  it('handles hidden files and deep paths', () => {
    expect(c('a/b/c/d/e/f/g/.zshrc', 'x\n').language).toBe('Shell');
    expect(c('.github/workflows/ci.yml', 'on: push\n')).toMatchObject({
      language: 'YAML',
      role: 'github-actions',
    });
  });
});

describe('roles', () => {
  it.each([
    ['docker-compose.yml', undefined, 'docker-compose'],
    ['deploy/compose.prod.yaml', undefined, 'docker-compose'],
    ['Dockerfile', undefined, 'dockerfile'],
    ['api/Dockerfile.dev', undefined, 'dockerfile'],
    ['.github/workflows/ci.yml', undefined, 'github-actions'],
    ['.gitlab-ci.yml', undefined, 'gitlab-ci'],
    ['Jenkinsfile', undefined, 'jenkins'],
    ['k8s/deploy.yaml', 'apiVersion: apps/v1\nkind: Deployment\n', 'kubernetes'],
    ['charts/x/Chart.yaml', undefined, 'helm'],
    ['infra/main.tf', undefined, 'terraform'],
    ['db/migrations/001_init.sql', undefined, 'sql-migration'],
    ['src/main/resources/db/V1__init.sql', undefined, 'flyway'],
    ['sql/pkg.sql', 'CREATE OR REPLACE PACKAGE BODY p AS', 'sql-procedure'],
    ['schema/x.sql', 'CREATE TABLE t (a int);', 'sql-schema'],
    ['pom.xml', undefined, 'maven'],
    ['build.gradle.kts', undefined, 'gradle'],
    ['package.json', undefined, 'npm-package'],
    ['pnpm-lock.yaml', undefined, 'lockfile'],
    ['Cargo.lock', undefined, 'lockfile'],
    ['go.sum', undefined, 'lockfile'],
    ['tsconfig.json', undefined, 'compiler-config'],
    ['api/openapi.yaml', 'openapi: 3.0.0\ninfo: {}\n', 'openapi'],
    ['proto/a.proto', undefined, 'protobuf'],
    ['.env.example', undefined, 'env-template'],
    ['src/main/resources/application.yml', undefined, 'app-config'],
    ['Makefile', undefined, 'make'],
    ['CMakeLists.txt', undefined, 'cmake'],
    ['README.md', undefined, 'docs'],
    ['docs/adr/0001-x.md', undefined, 'adr'],
    ['changelog.xml', '<databaseChangeLog>', 'liquibase'],
  ])('%s → %s', (path, head, role) => {
    expect(roleOf(path, head)?.id).toBe(role);
  });
  it('does not call every YAML file a Kubernetes manifest', () => {
    expect(roleOf('config/x.yaml', 'name: a\n')?.id).not.toBe('kubernetes');
  });
});

describe('inventory', () => {
  const rec = (
    path: string,
    language: string,
    status: FileRecord['status'],
    reason?: string,
  ): FileRecord => ({
    path,
    language,
    category: 'programming',
    status,
    method: status === 'full' ? 'TypeScript compiler API' : 'Generic text indexer',
    ...(reason ? { reason } : {}),
  });
  const records = [
    rec('src/a.ts', 'TypeScript', 'full'),
    rec('src/b.py', 'Python', 'partial'),
    rec('src/c.zzz', 'Unrecognised (.zzz)', 'text'),
    rec('src/d.json', 'JSON', 'failed', 'invalid JSON at line 3'),
    rec('.env', 'Dotenv', 'excluded', 'may contain credentials'),
    rec('logo.png', 'Binary: PNG image', 'binary', 'binary content'),
  ];
  const s = summarize(records, { producer: 'test' });
  it('counts every listed file exactly once', () => {
    expect(s.total).toBe(6);
    expect(checkInventory(s)).toEqual([]);
    expect(s.counts).toMatchObject({
      full: 1,
      partial: 1,
      text: 1,
      failed: 1,
      excluded: 1,
      binary: 1,
    });
  });
  it('measures coverage over readable files only, and separates full from partial', () => {
    expect(s.readable).toBe(4);
    expect(s.coverage).toBe(0.5);
    expect(s.fullCoverage).toBe(0.25);
  });
  it('lists every file that was not fully analysed, worst first, with the reason', () => {
    expect(s.notAnalysed[0]).toMatchObject({
      path: 'src/d.json',
      status: 'failed',
      reason: 'invalid JSON at line 3',
    });
    expect(s.notAnalysedTotal).toBe(4);
    expect(s.reasons.map((r) => r.status)).toEqual(['failed', 'excluded', 'binary']);
  });
  it('never claims full coverage unless the counts support it', () => {
    expect(coverageSentence(s)).toContain('50% of readable files were analysed (25% fully)');
    const all = summarize([rec('a.ts', 'TypeScript', 'full')], { producer: 't' });
    expect(coverageSentence(all)).toContain('100% of readable files were analysed (100% fully)');
  });
  it('breaks coverage down by directory', () => {
    expect(s.directories.find((d) => d.path === 'src')).toMatchObject({ files: 4, analysed: 2 });
    expect(s.directories.find((d) => d.path === '.')).toMatchObject({ files: 2 });
  });
});

describe('refinements from the validation runs', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const c = (path: string, text = '') => classify({ path, head: enc(text) });
  it('identifies files by where they live', () => {
    expect(
      c('core/src/main/resources/META-INF/services/org.keycloak.provider.Spi', 'org.x.Y\n')
        .language,
    ).toBe('Java service provider list');
    expect(c('app/conf/routes', 'GET / controllers.Home.index\n').language).toBe('Play routes');
    expect(c('app/conf/messages.fr', 'a=b\n').language).toBe('Java Properties');
    // A file merely named "routes" elsewhere is not assumed to be a Play routes file.
    expect(c('docs/routes', 'see below\n').language).toBe('Unrecognised (no extension)');
  });
  it('names certificates, keystores, Apple and Elixir formats, and fypp Fortran', () => {
    expect(c('certs/server.pem').language).toBe('PEM certificate or key');
    expect(c('certs/keystore.jks').language).toBe('Keystore');
    expect(c('lib/index.eex', '<%= x %>').language).toBe('EEx');
    expect(c('App/en.lproj/Localizable.strings', '"a" = "b";').language).toBe('Apple strings');
    expect(c('src/stdlib_sorting.fypp', 'module m\n').language).toBe('Fortran Free Form');
    expect(c('NOTICE', 'Copyright').language).toBe('Text');
    expect(c('requirements.in', 'flask\n').language).toBe('Pip Requirements');
  });
  it('classifies a template by the file type it wraps, as an inference', () => {
    const t = c('deploy/values.yaml.example', 'a: 1\n');
    expect(t).toMatchObject({ language: 'YAML', confidence: 'inferred' });
    expect(t.alternatives).toEqual(['Template (.example)']);
    expect(c('notes.in', 'x').language).toBe('Unrecognised (.in)');
  });
  it('recognises extensionless YAML and INI files by their line shape', () => {
    expect(
      c(
        '.import-restrictions',
        'rules:\n  # comment\n  - selectorRegexp: x\n    forbiddenPrefixes:\n    - a\n',
      ),
    ).toMatchObject({ language: 'YAML', detectedBy: 'content', confidence: 'inferred' });
    expect(c('gitconfig-work', '[user]\n  name = A\n  email = a@example.com\n')).toMatchObject({
      language: 'INI',
      detectedBy: 'content',
    });
    expect(c('VERSIONFILE', 'v1.2.3\n').language).toBe('Unrecognised (no extension)');
    expect(c('LICENSE-NOTES', 'This is: a sentence.\nAnd prose follows here.\n').language).toBe(
      'Unrecognised (no extension)',
    );
  });
});
