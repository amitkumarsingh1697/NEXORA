import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateBrain } from '@nexora/brain';
import { buildBrain, indexRepository, openDb, type CoverageReport } from '../src/index';
import type { Db } from '../src/store/db';

/**
 * A polyglot monorepo with the awkward cases discovery must not drop silently: extensionless
 * scripts with shebangs, hidden files, nested projects, legacy languages, infrastructure, a
 * binary, a UTF-16 file, a Git LFS pointer, a symbolic link and a git submodule.
 */
const FILES: Record<string, string | Buffer> = {
  'README.md': '# Polyglot\n\n## Services\n',
  '.editorconfig': 'root = true\n[*]\nindent_style = space\n',
  '.gitlab-ci.yml': 'stages: [build]\nbuild:\n  stage: build\n  script:\n    - make build\n',
  '.github/workflows/ci.yml':
    'name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ./bin/deploy\n',
  Makefile: 'build:\n\tgo build ./...\n\ntest: build\n\tgo test ./...\n',
  'docker-compose.yml': 'services:\n  api:\n    build: ./services/api\n',
  'services/api/Dockerfile': 'FROM golang:1.23\nCOPY . .\nRUN go build -o /api\nCMD ["/api"]\n',
  'services/api/go.mod': 'module example.com/api\n\ngo 1.23\n',
  'services/api/main.go':
    'package main\n\nimport "example.com/api/store"\n\nfunc main() { store.Open() }\n',
  'services/api/store/store.go': 'package store\n\nfunc Open() {}\n',
  'services/billing/src/main/kotlin/Billing.kt':
    'package billing\n\nclass Invoice(val id: String) {\n  fun total(): Int = 0\n}\n',
  'services/engine/src/lib.rs':
    'pub struct Engine;\n\nimpl Engine {\n    pub fn run(&self) {}\n}\n',
  'legacy/PAYROLL.cbl':
    '       IDENTIFICATION DIVISION.\n       PROGRAM-ID. PAYROLL.\n       PROCEDURE DIVISION.\n       MAIN-PARA.\n           STOP RUN.\n',
  'legacy/solver.f90':
    'module solver\ncontains\n  subroutine solve(x)\n    real :: x\n  end subroutine solve\nend module solver\n',
  'db/packages/billing.pkb':
    'CREATE OR REPLACE PACKAGE BODY billing AS\n  PROCEDURE close_month IS BEGIN NULL; END;\nEND billing;\n',
  'db/migrations/V1__init.sql': 'CREATE TABLE invoice (id INT PRIMARY KEY, total NUMERIC(10,2));\n',
  'infra/main.tf': 'resource "aws_s3_bucket" "logs" {\n  bucket = "logs"\n}\n',
  'flake.nix': '{\n  outputs = { self }: { };\n}\n',
  'deploy/k8s/api.yaml':
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 1\n',
  'api/openapi.yaml':
    'openapi: 3.0.0\ninfo:\n  title: API\n  version: "1"\npaths:\n  /invoices:\n    get:\n      operationId: listInvoices\n',
  'proto/billing.proto':
    'syntax = "proto3";\nservice Billing {\n  rpc Close (Req) returns (Res);\n}\nmessage Req {}\nmessage Res {}\n',
  // Extensionless, identified only by their shebang lines.
  'bin/deploy': '#!/usr/bin/env bash\nset -e\necho deploy\n',
  'scripts/report': '#!/usr/bin/env python3\ndef main():\n    pass\n',
  // A language nothing analyses, and a file nothing recognises.
  'tools/stats.apl': 'Avg ← {(+/⍵)÷≢⍵}\n',
  'notes/data.zzq': 'plain notes\n',
  // Defects found by the validation runs: an empty beans.xml, a .sln (not XML) and an
  // extensionless file whose content looks like YAML but is not.
  'services/billing/src/main/resources/META-INF/beans.xml': '',
  'dotnet/Shop.sln':
    'Microsoft Visual Studio Solution File, Format Version 12.00\nProject("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Api", "src\\Api\\Api.csproj", "{1}"\nEndProject\n',
  'dotnet/src/Api/Api.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
  'notes/expected-output': 'title: x\nitems: [a, b\nmore: here\n',
  // Binary, UTF-16 and LFS.
  'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  'win/setup.ps1': Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('function Install-App {\r\n  param($Path)\r\n}\r\n', 'utf16le'),
  ]),
  'models/weights.bin':
    'version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 12345\n',
};

let root: string;
let db: Db;
let repoId: number;
let report: CoverageReport;
let listed: string[];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-polyglot-'));
  for (const [p, body] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  symlinkSync('../README.md', join(root, 'docs-link.md'));
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args],
      {
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).toString();
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  // A submodule entry (gitlink) without cloning anything.
  git('update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},vendor/lib`);
  git('commit', '-q', '-m', 'initial');
  listed = git('ls-files').split('\n').filter(Boolean);
  db = openDb(':memory:');
  ({ repoId } = indexRepository(db, root));
  report = indexRepository(db, root);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const rec = (path: string) =>
  db
    .prepare(
      'SELECT language, category, role, status, method, reason, detected_by FROM file_inventory WHERE repo_id = ? AND path = ?',
    )
    .get(repoId, path) as
    | {
        language: string;
        category: string;
        role: string | null;
        status: string;
        method: string;
        reason: string | null;
        detected_by: string | null;
      }
    | undefined;

describe('universal language and file-type inventory', () => {
  it('accounts for every path git lists, with no silent omissions', () => {
    const inv = report.inventory;
    expect(inv.total).toBe(listed.length);
    const sum = Object.values(inv.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(inv.total);
    const stored = db
      .prepare('SELECT path FROM file_inventory WHERE repo_id = ? ORDER BY path')
      .all(repoId) as { path: string }[];
    expect(stored.map((r) => r.path)).toEqual([...listed].sort());
  });

  it('identifies extensionless scripts by their shebang', () => {
    expect(rec('bin/deploy')).toMatchObject({ language: 'Shell', detected_by: 'shebang' });
    expect(rec('scripts/report')).toMatchObject({
      language: 'Python',
      detected_by: 'shebang',
      status: 'partial',
    });
  });

  it('recognises hidden, build, CI, container, IaC, orchestration, API and database files', () => {
    expect(rec('.gitlab-ci.yml')?.role).toBe('gitlab-ci');
    expect(rec('.github/workflows/ci.yml')?.role).toBe('github-actions');
    expect(rec('.editorconfig')?.language).toBe('EditorConfig');
    expect(rec('Makefile')).toMatchObject({
      language: 'Makefile',
      role: 'make',
      status: 'partial',
    });
    expect(rec('services/api/Dockerfile')).toMatchObject({
      language: 'Dockerfile',
      role: 'dockerfile',
      status: 'full',
    });
    expect(rec('services/api/go.mod')).toMatchObject({
      role: 'go-module',
      status: 'full',
      method: 'go.mod directive reader',
    });
    expect(rec('infra/main.tf')).toMatchObject({ language: 'HCL', role: 'terraform' });
    expect(rec('flake.nix')?.language).toBe('Nix');
    expect(rec('deploy/k8s/api.yaml')?.role).toBe('kubernetes');
    expect(rec('api/openapi.yaml')?.role).toBe('openapi');
    expect(rec('proto/billing.proto')).toMatchObject({
      language: 'Protocol Buffer',
      status: 'partial',
    });
    expect(rec('db/migrations/V1__init.sql')?.role).toBe('flyway');
    expect(rec('db/packages/billing.pkb')?.language).toBe('PLSQL');
  });

  it('extracts declarations from languages without a compiler front end, as partial', () => {
    for (const p of [
      'legacy/PAYROLL.cbl',
      'legacy/solver.f90',
      'services/billing/src/main/kotlin/Billing.kt',
      'services/engine/src/lib.rs',
      'services/api/main.go',
    ])
      expect(rec(p)?.status, p).toBe('partial');
    expect(rec('legacy/PAYROLL.cbl')?.language).toBe('COBOL');
    expect(rec('legacy/solver.f90')?.language).toBe('Fortran Free Form');
    const names = (
      db.prepare("SELECT name FROM nodes WHERE repo_id = ? AND kind = 'symbol'").all(repoId) as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['Invoice', 'Invoice.total', 'Engine', 'main', 'Open', 'solver']),
    );
    // Nothing is ever "fully" analysed without the TypeScript compiler.
    expect(report.inventory.counts.full).toBeLessThan(report.inventory.analysed);
  });

  it('keeps text-only, unknown, binary, LFS, UTF-16, symlink and submodule apart', () => {
    expect(rec('tools/stats.apl')).toMatchObject({ language: 'APL', status: 'text' });
    expect(rec('notes/data.zzq')).toMatchObject({
      language: 'Unrecognised (.zzq)',
      status: 'text',
    });
    expect(rec('assets/logo.png')).toMatchObject({ status: 'binary' });
    expect(rec('models/weights.bin')).toMatchObject({
      language: 'Git LFS pointer',
      status: 'unsupported',
    });
    expect(rec('win/setup.ps1')).toMatchObject({ language: 'PowerShell', status: 'partial' });
    expect(rec('docs-link.md')).toMatchObject({ status: 'excluded' });
    expect(rec('docs-link.md')?.reason).toMatch(/symbolic link/);
    expect(rec('vendor/lib')).toMatchObject({ status: 'excluded' });
    expect(rec('vendor/lib')?.reason).toMatch(/submodule/);
  });

  it('never calls an empty file or a wrong format guess a failure', () => {
    expect(rec('services/billing/src/main/resources/META-INF/beans.xml')).toMatchObject({
      status: 'full',
      method: 'Empty file (nothing to analyse)',
    });
    expect(rec('dotnet/Shop.sln')).toMatchObject({
      status: 'full',
      method: 'Visual Studio solution reader',
    });
    const guess = rec('notes/expected-output');
    expect(guess).toMatchObject({ language: 'YAML', status: 'text', detected_by: 'content' });
    expect(guess?.reason).toMatch(/content looked like YAML, but it does not parse as YAML/);
    expect(report.inventory.counts.failed).toBe(0);
  });

  it('links build, CI and container files to what they build and run', () => {
    const links = db
      .prepare(
        "SELECT e.kind, s.key AS src, d.key AS dst, e.confidence FROM edges e JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst WHERE e.repo_id = ? AND e.kind IN ('builds','runs','includes')",
      )
      .all(repoId) as { kind: string; src: string; dst: string; confidence: string }[];
    expect(links).toContainEqual({
      kind: 'runs',
      src: '.github/workflows/ci.yml',
      dst: 'bin/deploy',
      confidence: 'observed',
    });
    expect(links).toContainEqual({
      kind: 'builds',
      src: 'docker-compose.yml',
      dst: 'services/api/Dockerfile',
      confidence: 'inferred',
    });
  });

  it('puts the inventory on the brain, which validates unchanged', () => {
    const brain = buildBrain(db, repoId)!;
    expect(brain.coverage?.inventory?.total).toBe(listed.length);
    expect(brain.coverage?.summary).toMatch(/^\d+ files found, /);
    expect(brain.coverage?.partial).toBe(true);
    expect(brain.synapses.some((s) => s.kind === 'runs')).toBe(true);
    expect(brain.synapses.some((s) => s.kind === 'imports' && s.confidence === 'inferred')).toBe(
      true,
    );
    const r = validateBrain(JSON.parse(JSON.stringify(brain)));
    expect(r.ok && r.model.coverage).toEqual(brain.coverage);
  });
});
