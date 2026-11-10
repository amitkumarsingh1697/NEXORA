import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routineDiagram, validateBrain, type BrainModel } from '@nexora/brain';
import { buildBrain, indexRepository, openDb, type Db } from '../src/index';

/** A repository with PostgreSQL migrations, a MySQL procedure file and a broken file. */
const FILES: Record<string, string> = {
  'db/migrations/001_schema.sql': [
    'CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL);',
    'CREATE TABLE orders (id bigint PRIMARY KEY, user_id int REFERENCES users(id));',
    '',
    'CREATE VIEW user_orders AS',
    '  SELECT u.email, o.id AS order_id FROM users u JOIN orders o ON o.user_id = u.id;',
    '',
    'CREATE FUNCTION add_user(p_email text) RETURNS int LANGUAGE plpgsql AS $$',
    'DECLARE n int;',
    'BEGIN',
    '  INSERT INTO users(email) VALUES (p_email) RETURNING id INTO n;',
    '  PERFORM log_event(n);',
    '  RETURN n;',
    'END $$;',
    '',
    'CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;',
    'CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch();',
    'CREATE INDEX users_email_idx ON users (email);',
    'CREATE SEQUENCE order_no OWNED BY orders.id;',
    "COMMENT ON VIEW user_orders IS 'Orders with the buyer''s email';",
    '',
  ].join('\n'),
  'db/migrations/002_events.sql': [
    'CREATE FUNCTION log_event(ref int) RETURNS void LANGUAGE sql AS $$',
    '  INSERT INTO events(ref) VALUES (ref);',
    '$$;',
    '',
  ].join('\n'),
  'db/mysql/reports.sql': [
    'DELIMITER $$',
    'CREATE PROCEDURE monthly_report(IN p_month INT, OUT p_total INT)',
    'BEGIN',
    '  SELECT COUNT(*) INTO p_total FROM orders WHERE MONTH(created) = p_month;',
    '  CALL archive_month(p_month);',
    'END$$',
    'DELIMITER ;',
    '',
  ].join('\n'),
  'db/broken.sql':
    'CREATE TABLE ok (id int);\nCREATE TABLE bad (id int,, x int) ;\n-- $$ LANGUAGE plpgsql\n',
};

let root: string;
let db: Db;
let repoId: number;
let brain: BrainModel;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codeatlas-sql-'));
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
  db = openDb(':memory:');
  repoId = indexRepository(db, root).repoId;
  const b = buildBrain(db, repoId);
  if (!b) throw new Error('no brain');
  brain = b;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const status = (path: string) =>
  db
    .prepare('SELECT status, method, reason FROM file_inventory WHERE repo_id = ? AND path = ?')
    .get(repoId, path) as { status: string; method: string; reason: string | null } | undefined;

const node = (key: string) => {
  const r = db
    .prepare('SELECT symbol_kind AS kind, data FROM nodes WHERE repo_id = ? AND key = ?')
    .get(repoId, key) as { kind: string; data: string } | undefined;
  return r ? { kind: r.kind, data: JSON.parse(r.data) as Record<string, unknown> } : undefined;
};

const edge = (kind: string, src: string, dstKey: string) =>
  db
    .prepare(
      `SELECT e.confidence, e.detail, e.evidence_line AS line FROM edges e JOIN nodes s ON s.id = e.src JOIN nodes d ON d.id = e.dst
       WHERE e.repo_id = ? AND e.kind = ? AND s.key = ? AND d.key = ?`,
    )
    .get(repoId, kind, src, dstKey) as
    { confidence: string; detail: string; line: number } | undefined;

const S = 'db/migrations/001_schema.sql';

describe('database objects in the index', () => {
  it('marks PostgreSQL files full, and says how other files were read', () => {
    expect(status(S)).toEqual({
      status: 'full',
      method: 'Full parse (libpg-query 18.2.2 (PostgreSQL 18 parser))',
      reason: null,
    });
    expect(status('db/mysql/reports.sql')).toMatchObject({
      status: 'partial',
      reason: 'no complete MySQL/MariaDB grammar is bundled; read by the statement reader',
    });
    expect(status('db/broken.sql')?.reason).toMatch(/^1 problem; first at line 2 \(syntax error/);
  });

  it('stores views, routines, triggers, indexes and sequences with their definitions', () => {
    expect(node(`${S}#user_orders`)).toMatchObject({
      kind: 'view',
      data: {
        extraction: 'sql',
        declKind: 'view',
        doc: "Orders with the buyer's email",
        columns: [{ name: 'email' }, { name: 'order_id' }],
      },
    });
    expect(node(`${S}#add_user`)).toMatchObject({
      kind: 'function',
      data: {
        returns: 'int4',
        routineLanguage: 'plpgsql',
        params: [{ name: 'p_email', type: 'text', mode: 'in', optional: false }],
        writes: ['users'],
      },
    });
    expect(node(`${S}#trigger:users.users_touch`)).toMatchObject({
      kind: 'trigger',
      data: {
        table: 'users',
        timing: 'BEFORE',
        events: ['UPDATE'],
        forEach: 'row',
        executes: 'touch',
      },
    });
    expect(node(`${S}#index:users_email_idx`)?.data).toMatchObject({ indexColumns: ['email'] });
    expect(node(`${S}#sequence:order_no`)?.data).toMatchObject({ ownedBy: 'orders.id' });
    expect(node('db/mysql/reports.sql#monthly_report')).toMatchObject({
      kind: 'procedure',
      data: {
        dialect: 'MySQL/MariaDB',
        params: [
          { name: 'p_month', type: 'INT', mode: 'in' },
          { name: 'p_total', type: 'INT', mode: 'out' },
        ],
      },
    });
  });

  it('links bodies to the tables they read and write, by line and with how the name was read', () => {
    expect(edge('reads_table', `${S}#user_orders`, 'table:orders')).toEqual({
      confidence: 'observed',
      detail: 'reads table orders',
      line: 5,
    });
    expect(edge('writes_table', `${S}#add_user`, 'table:users')).toEqual({
      confidence: 'observed',
      detail: 'writes table users',
      line: 10,
    });
    // The MySQL file names orders, defined in the PostgreSQL migration.
    expect(edge('reads_table', 'db/mysql/reports.sql#monthly_report', 'table:orders')).toEqual({
      confidence: 'inferred',
      detail: 'reads table orders (read by the statement reader)',
      line: 4,
    });
  });

  it('links calls between routines across files, and triggers and indexes to their tables', () => {
    expect(edge('calls', `${S}#add_user`, 'db/migrations/002_events.sql#log_event')).toEqual({
      confidence: 'inferred',
      detail: 'log_event: called in the body, matched by name in db/migrations/002_events.sql',
      line: 11,
    });
    expect(edge('calls', `${S}#trigger:users.users_touch`, `${S}#touch`)).toMatchObject({
      confidence: 'observed',
      detail: 'touch: the function the trigger runs',
    });
    expect(edge('fires_on', `${S}#trigger:users.users_touch`, 'table:users')).toMatchObject({
      confidence: 'observed',
      detail: 'BEFORE UPDATE ON users',
    });
    expect(edge('indexes', `${S}#index:users_email_idx`, 'table:users')).toMatchObject({
      confidence: 'observed',
    });
    expect(edge('references', `${S}#sequence:order_no`, 'table:orders')).toMatchObject({
      detail: 'owned by orders.id',
    });
  });

  it('keeps names it could not link on the object instead of drawing them', () => {
    expect(node('db/migrations/002_events.sql#log_event')?.data.unresolvedReads).toEqual([
      'events',
    ]);
    expect(node('db/mysql/reports.sql#monthly_report')?.data.unresolvedCalls).toEqual([
      'archive_month',
    ]);
  });

  it('draws database objects in the database lobe with their details and a diagram', () => {
    const r = validateBrain(JSON.parse(JSON.stringify(brain)));
    expect(r.ok).toBe(true);
    const view = brain.neurons.find((n) => n.name === 'user_orders');
    const trig = brain.neurons.find((n) => n.name === 'users_touch');
    const proc = brain.neurons.find((n) => n.name === 'monthly_report');
    expect(view).toMatchObject({
      kind: 'view',
      region: 'database',
      doc: "Orders with the buyer's email",
    });
    expect(trig?.details).toContainEqual({ label: 'Fires', value: 'BEFORE UPDATE for each row' });
    expect(proc?.params).toEqual([
      { name: 'p_month', type: 'INT', optional: false },
      { name: 'p_total', type: 'INT', optional: false, mode: 'out' },
    ]);
    expect(proc?.details).toContainEqual({ label: 'Calls not linked', value: 'archive_month' });
    const users = brain.neurons.find((n) => n.kind === 'table' && n.name === 'users');
    expect(brain.synapses.find((s) => s.source === trig?.id && s.target === users?.id)?.kind).toBe(
      'fires_on',
    );
    const d = routineDiagram(brain);
    expect(d.shown).toBeGreaterThanOrEqual(5);
    expect(d.svg).toContain('user_orders');
    expect(d.svg).toContain('«trigger»');
  });
});
