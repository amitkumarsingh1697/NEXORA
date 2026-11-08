/**
 * Configuration, service-call and database-access heuristics (spec §5.3, S3-3 and S3-7).
 *
 * Labelling:
 * - `reads_config` to an environment variable is **observed**: the variable name is a
 *   literal in the code (`process.env.NAME`, `process.env['NAME']`, `import.meta.env.NAME`,
 *   or destructured from `process.env`).
 * - `reads_config` to a configuration file, `calls_service` and `accesses_db` are
 *   **inferred**: the file, host or database is only certain at runtime. The detail says
 *   which call matched.
 * - Nothing is guessed from a computed name or URL: those go to a single
 *   "not known statically" node, or to `unresolved`.
 *
 * Package detection works without node_modules: an identifier is traced back to the
 * `import` or `require()` that introduced it, and module-level clients
 * (`const pool = new Pool()`) are remembered across files through the type checker.
 */
import { posix } from 'node:path';
import ts from 'typescript';
import type { GraphBuilder, NodeRef } from './model';

export type IntegrationCategory = 'http' | 'db';

/** Packages whose calls are treated as database access. */
export const DB_PACKAGES: Record<string, string> = {
  pg: 'PostgreSQL (pg)',
  postgres: 'PostgreSQL (postgres)',
  '@neondatabase/serverless': 'PostgreSQL (Neon serverless)',
  'drizzle-orm': 'Drizzle ORM',
  '@prisma/client': 'Prisma',
  mysql2: 'MySQL (mysql2)',
  mysql: 'MySQL (mysql)',
  mongodb: 'MongoDB',
  mongoose: 'MongoDB (mongoose)',
  'better-sqlite3': 'SQLite (better-sqlite3)',
  'node:sqlite': 'SQLite (node:sqlite)',
  sqlite3: 'SQLite (sqlite3)',
  redis: 'Redis',
  ioredis: 'Redis (ioredis)',
  knex: 'Knex',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  kysely: 'Kysely',
};

/** Packages whose calls are treated as outbound HTTP. `fetch` (a global) is handled separately. */
export const HTTP_PACKAGES = new Set(['axios', 'got', 'ky', 'node-fetch', 'undici', 'superagent']);

const CONFIG_FILE_RE =
  /\.(json|jsonc|ya?ml|toml|ini|conf|cfg|properties)$|(^|\/)\.env(\.[\w.-]+)?$/i;
const READ_FILE_NAMES = new Set(['readFileSync', 'readFile']);

interface Client {
  category: IntegrationCategory;
  pkg: string;
  baseUrl?: string;
}

/** Normalises 'drizzle-orm/node-postgres' -> 'drizzle-orm', 'pg' -> 'pg'. */
export function packageRoot(spec: string): string {
  if (spec.startsWith('node:')) return spec;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? spec);
}

function categoryOf(pkg: string): IntegrationCategory | null {
  if (pkg in DB_PACKAGES) return 'db';
  if (HTTP_PACKAGES.has(pkg)) return 'http';
  return null;
}

function literalText(e: ts.Expression | undefined): string | null {
  if (!e) return null;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  return null;
}

/** The static prefix of a URL argument: a literal, or the head of a template. */
function urlPrefix(e: ts.Expression | undefined): { text: string; complete: boolean } | null {
  if (!e) return null;
  const lit = literalText(e);
  if (lit !== null) return { text: lit, complete: true };
  if (ts.isTemplateExpression(e)) return { text: e.head.text, complete: false };
  if (ts.isNewExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'URL')
    return urlPrefix(e.arguments?.[0]);
  return null;
}

/** Where a URL points: a host, the page's own origin, or not known statically. */
export function classifyUrl(prefix: string | null): {
  key: string;
  name: string;
  path?: string;
} {
  if (prefix) {
    const abs = /^(https?|wss?):\/\/([^/?#:]+)(:\d+)?([^?#]*)/i.exec(prefix);
    if (abs?.[2]) {
      const host = abs[2].toLowerCase() + (abs[3] ?? '');
      return { key: `http:${host}`, name: host, path: abs[4] || undefined };
    }
    if (prefix.startsWith('/') && !prefix.startsWith('//'))
      return { key: 'http:same-origin', name: 'Same origin (relative URL)', path: prefix };
  }
  return { key: 'http:dynamic', name: 'HTTP (URL not known statically)' };
}

/** The module specifier an identifier was imported or required from, if any. */
export function importSourceOf(checker: ts.TypeChecker, id: ts.Identifier): string | null {
  const sym = checker.getSymbolAtLocation(id);
  const decl = sym?.declarations?.[0];
  if (!decl) return null;
  let n: ts.Node | undefined = decl;
  while (n && !ts.isSourceFile(n)) {
    if (ts.isImportDeclaration(n))
      return ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : null;
    if (ts.isImportEqualsDeclaration(n)) {
      const r = n.moduleReference;
      return ts.isExternalModuleReference(r) && ts.isStringLiteral(r.expression)
        ? r.expression.text
        : null;
    }
    if (ts.isVariableDeclaration(n)) {
      const init = n.initializer;
      if (
        init &&
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === 'require'
      )
        return literalText(init.arguments[0]);
      return null;
    }
    if (!(
      ts.isImportSpecifier(n) ||
      ts.isImportClause(n) ||
      ts.isNamedImports(n) ||
      ts.isNamespaceImport(n) ||
      ts.isBindingElement(n) ||
      ts.isObjectBindingPattern(n)
    ))
      return null;
    n = n.parent;
  }
  return null;
}

function rootIdentifierNode(e: ts.Expression): ts.Identifier | null {
  let x: ts.Expression = e;
  while (
    ts.isPropertyAccessExpression(x) ||
    ts.isElementAccessExpression(x) ||
    ts.isCallExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isParenthesizedExpression(x) ||
    ts.isAwaitExpression(x)
  )
    x = x.expression;
  return ts.isIdentifier(x) ? x : null;
}

function isProcessEnv(e: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(e) &&
    e.name.text === 'env' &&
    ((ts.isIdentifier(e.expression) && e.expression.text === 'process') ||
      (ts.isMetaProperty(e.expression) && e.expression.name.text === 'meta'))
  );
}

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

export interface IntegrationContext {
  graph: GraphBuilder;
  repoFiles: Set<string>;
  /** Called for each database client call, so table use can be read from it. */
  onDbCall?: (
    node: ts.CallExpression | ts.NewExpression,
    pkg: string,
    sf: ts.SourceFile,
    path: string,
    owner: NodeRef,
  ) => void;
}

/**
 * Detects integrations. Call `collectClients` for every file first (so a client
 * exported from one file is known where it is imported), then `visit` from the
 * reference pass for each node.
 */
export class IntegrationDetector {
  private readonly clients = new Map<ts.Node, Client>();

  constructor(private readonly ctx: IntegrationContext) {}

  /** Remember module-level clients: `const pool = new Pool()`, `export const api = axios.create(...)`. */
  collectClients(sf: ts.SourceFile, checker: ts.TypeChecker): void {
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        const client = d.initializer && this.clientFrom(d.initializer, checker);
        if (client) this.clients.set(d, client);
      }
    }
  }

  private clientFrom(init: ts.Expression, checker: ts.TypeChecker): Client | null {
    let e = init;
    while (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    if (!(ts.isNewExpression(e) || ts.isCallExpression(e))) return null;
    const root = rootIdentifierNode(e.expression);
    if (!root) return null;
    const known = this.clientOf(root, checker);
    if (known) {
      const base = ts.isCallExpression(e) ? baseUrlOf(e) : undefined;
      return { ...known, ...(base ? { baseUrl: base } : {}) };
    }
    return null;
  }

  /** The client or integration package behind an identifier, if any. */
  private clientOf(id: ts.Identifier, checker: ts.TypeChecker): Client | null {
    const spec = importSourceOf(checker, id);
    if (spec) {
      const pkg = packageRoot(spec);
      const category = categoryOf(pkg);
      if (category) return { category, pkg };
    }
    let sym = checker.getSymbolAtLocation(id);
    if (sym && sym.flags & ts.SymbolFlags.Alias) {
      try {
        sym = checker.getAliasedSymbol(sym);
      } catch {
        return null;
      }
    }
    const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
    return (decl && this.clients.get(decl)) ?? null;
  }

  visit(
    node: ts.Node,
    sf: ts.SourceFile,
    path: string,
    checker: ts.TypeChecker,
    ownerOf: () => NodeRef,
  ): void {
    // Cheap kind checks first: this runs for every node of every file.
    if (
      !ts.isPropertyAccessExpression(node) &&
      !ts.isElementAccessExpression(node) &&
      !ts.isVariableDeclaration(node) &&
      !ts.isImportDeclaration(node) &&
      !ts.isCallExpression(node) &&
      !ts.isNewExpression(node)
    )
      return;
    const owner = (): NodeRef => ownerOf();
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
      this.envEdge(node.name.text, node, sf, path, owner());
    } else if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression) &&
      node.argumentExpression
    ) {
      const name = literalText(node.argumentExpression);
      if (name) this.envEdge(name, node, sf, path, owner());
      else
        this.ctx.graph.addUnresolved({
          filePath: path,
          line: lineOf(sf, node.getStart(sf)),
          kind: 'config',
          text: node.getText(sf),
          reason: 'environment variable name is computed',
        });
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isProcessEnv(node.initializer)
    ) {
      for (const el of node.name.elements) {
        const key = el.propertyName ?? el.name;
        if (ts.isIdentifier(key) || ts.isStringLiteral(key))
          this.envEdge(key.text, el, sf, path, owner());
      }
    } else if (
      ts.isImportDeclaration(node) &&
      literalText(node.moduleSpecifier as ts.Expression) === 'dotenv/config'
    ) {
      this.dotenvEdge(node, sf, path, owner());
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      this.callEdge(node, sf, path, checker, owner);
    }
  }

  private envEdge(name: string, at: ts.Node, sf: ts.SourceFile, path: string, owner: NodeRef) {
    const parent = at.parent;
    const written =
      ts.isBinaryExpression(parent) &&
      parent.left === at &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    this.ctx.graph.addEdge({
      kind: written ? 'writes_config' : 'reads_config',
      src: owner,
      dst: this.ctx.graph.addNode({
        kind: 'config',
        key: `env:${name}`,
        name,
        data: { source: 'environment variable' },
      }),
      confidence: 'observed',
      evidencePath: path,
      evidenceLine: lineOf(sf, at.getStart(sf)),
      detail: at.getText(sf).slice(0, 120),
    });
  }

  private dotenvEdge(at: ts.Node, sf: ts.SourceFile, path: string, owner: NodeRef) {
    this.ctx.graph.addEdge({
      kind: 'reads_config',
      src: owner,
      dst: this.configFileNode('.env', path),
      confidence: 'inferred',
      evidencePath: path,
      evidenceLine: lineOf(sf, at.getStart(sf)),
      detail: 'dotenv loads .env from the working directory by default',
    });
  }

  /** A config file: the repo file node when the path resolves, otherwise a config node. */
  private configFileNode(literal: string, fromPath: string): NodeRef {
    const clean = literal.replace(/^\.\//, '');
    const candidates = [
      posix.normalize(posix.join(posix.dirname(fromPath), literal)),
      posix.normalize(clean),
    ];
    for (const c of candidates)
      if (!c.startsWith('..') && this.ctx.repoFiles.has(c) && !/(^|\/)\.env/.test(c))
        return { kind: 'file', key: c };
    return this.ctx.graph.addNode({
      kind: 'config',
      key: `file:${clean}`,
      name: clean,
      data: { source: 'configuration file' },
    });
  }

  private callEdge(
    node: ts.CallExpression | ts.NewExpression,
    sf: ts.SourceFile,
    path: string,
    checker: ts.TypeChecker,
    ownerOf: () => NodeRef,
  ) {
    const callee = node.expression;
    const args = node.arguments ?? ts.factory.createNodeArray();
    const line = (): number => lineOf(sf, node.getStart(sf));
    const text = (): string => node.getText(sf).split('\n')[0]!.slice(0, 120);
    const calleeName = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : '';

    // Configuration files read with fs.
    if (ts.isCallExpression(node) && READ_FILE_NAMES.has(calleeName)) {
      const lit = lastLiteral(args[0]);
      if (lit && CONFIG_FILE_RE.test(lit)) {
        this.ctx.graph.addEdge({
          kind: 'reads_config',
          src: ownerOf(),
          dst: this.configFileNode(lit, path),
          confidence: 'inferred',
          evidencePath: path,
          evidenceLine: line(),
          detail: `${calleeName}() of a configuration file path; resolved at runtime`,
        });
      }
      return;
    }

    // Global fetch (not a local function named fetch).
    if (ts.isCallExpression(node) && ts.isIdentifier(callee) && callee.text === 'fetch') {
      const spec = importSourceOf(checker, callee);
      const sym = checker.getSymbolAtLocation(callee);
      const decl = sym?.valueDeclaration ?? sym?.declarations?.[0];
      const isGlobal = !spec && (!decl || decl.getSourceFile().isDeclarationFile);
      if (isGlobal || (spec && HTTP_PACKAGES.has(packageRoot(spec)))) {
        this.serviceEdge(
          urlPrefix(args[0]),
          undefined,
          methodOf(args[1]),
          ownerOf(),
          path,
          line(),
          text(),
        );
      }
      return;
    }

    const root = rootIdentifierNode(callee);
    if (!root) return;
    const client = this.clientOf(root, checker);
    if (!client) return;
    if (client.category === 'db') {
      this.ctx.onDbCall?.(node, client.pkg, sf, path, ownerOf());
      this.ctx.graph.addEdge({
        kind: 'accesses_db',
        src: ownerOf(),
        dst: this.ctx.graph.addNode({
          kind: 'service',
          key: `db:${client.pkg}`,
          name: DB_PACKAGES[client.pkg] ?? client.pkg,
          data: { category: 'database', package: client.pkg },
        }),
        confidence: 'inferred',
        evidencePath: path,
        evidenceLine: line(),
        detail: `${text()} (client from ${client.pkg})`,
      });
      return;
    }
    // HTTP client: axios(url), axios.get(url), api.post(path) with a known baseURL.
    if (calleeName === 'create' || calleeName === 'extend') return; // constructing a client is not a call
    const verb = HTTP_METHODS.has(calleeName.toLowerCase()) ? calleeName.toUpperCase() : undefined;
    const first = urlPrefix(args[0]);
    this.serviceEdge(
      first,
      client.baseUrl,
      verb,
      ownerOf(),
      path,
      line(),
      `${text()} (${client.pkg})`,
    );
  }

  private serviceEdge(
    url: { text: string; complete: boolean } | null,
    baseUrl: string | undefined,
    method: string | undefined,
    owner: NodeRef,
    path: string,
    line: number,
    text: string,
  ) {
    let prefix = url?.text ?? null;
    if (baseUrl && (prefix === null || !/^[a-z]+:\/\//i.test(prefix)))
      prefix = baseUrl.replace(/\/$/, '') + (prefix ?? '');
    const target = classifyUrl(prefix);
    this.ctx.graph.addEdge({
      kind: 'calls_service',
      src: owner,
      dst: this.ctx.graph.addNode({
        kind: 'service',
        key: target.key,
        name: target.name,
        data: { category: 'http' },
      }),
      confidence: 'inferred',
      evidencePath: path,
      evidenceLine: line,
      detail: [method, target.path, '·', text].filter(Boolean).join(' ').slice(0, 200),
    });
  }
}

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'request',
]);

function methodOf(init: ts.Expression | undefined): string | undefined {
  if (!init || !ts.isObjectLiteralExpression(init)) return undefined;
  for (const p of init.properties)
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'method') {
      const m = literalText(p.initializer);
      if (m) return m.toUpperCase();
    }
  return undefined;
}

function baseUrlOf(call: ts.CallExpression): string | undefined {
  const opts = call.arguments[0];
  if (!opts || !ts.isObjectLiteralExpression(opts)) return undefined;
  for (const p of opts.properties)
    if (ts.isPropertyAssignment(p) && /^(baseURL|prefixUrl|baseUrl)$/.test(p.name.getText())) {
      const v = literalText(p.initializer);
      if (v) return v;
    }
  return undefined;
}

/** `'config.json'`, or the last literal of `join(__dirname, 'config.json')`. */
function lastLiteral(e: ts.Expression | undefined): string | null {
  if (!e) return null;
  const lit = literalText(e);
  if (lit !== null) return lit;
  if (ts.isCallExpression(e)) {
    const last = e.arguments[e.arguments.length - 1];
    return lastLiteral(last);
  }
  return null;
}
