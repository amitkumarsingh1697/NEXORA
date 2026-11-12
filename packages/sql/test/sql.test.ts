import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyseSql,
  blankClientInput,
  detectDialect,
  initSql,
  unterminatedQueries,
  splitStatements,
  tokenize,
  type SqlObject,
  type SqlResult,
} from '../src/index';

const fixture = (f: string) => readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8');
const find = (r: SqlResult, kind: SqlObject['kind'], name: string, parent?: string) => {
  const o = r.objects.find((x) => x.kind === kind && x.name === name && x.parent === parent);
  if (!o)
    throw new Error(
      `no ${kind} ${name} in ${r.objects.map((x) => `${x.kind}:${x.name}`).join(', ')}`,
    );
  return o;
};
const names = (refs: { name: string; schema?: string }[] | undefined) =>
  (refs ?? []).map((r) => (r.schema ? `${r.schema}.${r.name}` : r.name));

beforeAll(async () => {
  await initSql();
});

describe('tokenizer', () => {
  it('never reads names inside strings or comments', () => {
    const t = tokenize("SELECT 'FROM users' -- FROM orders\n/* FROM x */ FROM t", 'postgresql');
    expect(t.map((x) => x.text)).toEqual(['SELECT', "'FROM users'", 'FROM', 't']);
    expect(t[3]!.line).toBe(2);
  });
  it('knows each dialect’s quoting', () => {
    expect(tokenize('[dbo].[My Table]', 'tsql').map((x) => x.text)).toEqual([
      'dbo',
      '.',
      'My Table',
    ]);
    expect(tokenize('`a``b`', 'mysql')[0]).toMatchObject({ kind: 'ident', text: 'a`b' });
    expect(tokenize("'it\\'s' x", 'mysql').map((x) => x.kind)).toEqual(['string', 'word']);
    expect(tokenize("q'[it's]' x", 'oracle').map((x) => x.kind)).toEqual(['string', 'word']);
    expect(tokenize('$fn$ BEGIN; END $fn$ x', 'postgresql').map((x) => x.kind)).toEqual([
      'string',
      'word',
    ]);
    expect(tokenize('# note\nSELECT', 'mysql').map((x) => x.text)).toEqual(['SELECT']);
  });
  it('survives an unterminated string', () => {
    expect(tokenize("SELECT 'oops", 'generic').at(-1)).toMatchObject({ kind: 'string' });
  });
});

describe('statement splitter', () => {
  const lines = (text: string, d: Parameters<typeof splitStatements>[1]) =>
    splitStatements(text, d).map((s) => [s.line, s.endLine]);
  it('keeps procedure bodies with semicolons together', () => {
    expect(
      lines('CREATE PROCEDURE p() BEGIN\n  SELECT 1;\n  SELECT 2;\nEND;\nSELECT 3;', 'mysql'),
    ).toEqual([
      [1, 4],
      [5, 5],
    ]);
  });
  it('splits SQL Server batches on GO and Oracle units on /', () => {
    expect(lines('CREATE PROC p AS\nSELECT 1;\nSELECT 2\nGO\nSELECT 3', 'tsql')).toEqual([
      [1, 3],
      [5, 5],
    ]);
    expect(
      lines(
        'CREATE PROCEDURE p IS\n  v NUMBER;\nBEGIN\n  NULL;\nEND;\n/\nSELECT 1 FROM dual;',
        'oracle',
      ),
    ).toEqual([
      [1, 5],
      [7, 7],
    ]);
  });
  it('follows DELIMITER and Db2 terminators', () => {
    expect(
      lines(
        'DELIMITER //\nCREATE PROCEDURE p() BEGIN SELECT 1; END//\nDELIMITER ;\nSELECT 2;',
        'mysql',
      ),
    ).toEqual([
      [2, 2],
      [4, 4],
    ]);
    expect(
      lines('--#SET TERMINATOR @\nCREATE PROCEDURE p() BEGIN SELECT 1; END@\nSELECT 2@', 'db2'),
    ).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });
  it('does not treat BEGIN; (a transaction) as a block', () => {
    expect(lines('BEGIN;\nINSERT INTO t VALUES (1);\nCOMMIT;', 'postgresql')).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe('dialect', () => {
  it('uses decisive syntax over the language hint', () => {
    expect(detectDialect('DELIMITER $$\nCREATE TRIGGER t …', 'PLSQL').dialect).toBe('mysql');
    expect(detectDialect('CREATE PROC p AS SELECT 1\nGO\n').dialect).toBe('tsql');
    expect(detectDialect('x', 'PLpgSQL').dialect).toBe('postgresql');
    expect(detectDialect('CREATE TABLE t (id int);').dialect).toBe('generic');
  });
});

describe('PostgreSQL through its own parser', () => {
  let r: SqlResult;
  beforeAll(() => {
    r = analyseSql(fixture('postgres.sql'), 'PLpgSQL');
  });

  it('parses every statement', () => {
    expect(r).toMatchObject({
      dialect: 'postgresql',
      mode: 'parser',
      statements: 19,
      understood: 19,
      parsedStatements: 19,
      problems: [],
    });
    expect(r.method).toBe('libpg-query 18.2.2 (PostgreSQL 18 parser)');
  });

  it('reads views with their columns and the tables they read', () => {
    expect(find(r, 'view', 'active_users')).toMatchObject({
      line: 9,
      endLine: 10,
      columns: [{ name: 'uid' }, { name: 'mail' }],
      reads: [
        { name: 'users', schema: 'public', line: 10 },
        { name: 'orders', line: 10 },
      ],
    });
    expect(find(r, 'materialized-view', 'order_totals').columns?.map((c) => c.name)).toEqual([
      'user_id',
      'total',
    ]);
  });

  it('reads functions: parameters, defaults, return type, language and PL/pgSQL body references by line', () => {
    const f = find(r, 'function', 'add_user');
    expect(f).toMatchObject({
      line: 15,
      endLine: 24,
      language: 'plpgsql',
      returns: 'int4',
      comment: 'Creates a user',
      params: [
        { name: 'p_email', type: 'text', mode: 'in' },
        { name: 'p_note', type: 'text', mode: 'in', default: "'none'" },
      ],
      writes: [
        { name: 'users', line: 19 },
        { name: 'stats', line: 21 },
      ],
      dynamicSql: [22],
    });
    expect(f.calls).toContainEqual({ name: 'log_event', line: 20, explicit: true });
    expect(find(r, 'function', 'log_event').writes).toEqual([{ name: 'events', line: 27 }]);
    expect(find(r, 'function', 'order_count')).toMatchObject({
      returns: 'TABLE(n int8)',
      reads: [{ name: 'orders', line: 32 }],
    });
    expect(find(r, 'procedure', 'purge')).toMatchObject({
      writes: [{ name: 'orders', line: 37 }],
      calls: [{ name: 'log_event', line: 38, explicit: true }],
    });
  });

  it('reads triggers, indexes, sequences, types, domains and policies', () => {
    expect(find(r, 'trigger', 'users_touch')).toMatchObject({
      table: 'users',
      timing: 'BEFORE',
      events: ['INSERT', 'UPDATE OF email'],
      forEach: 'row',
      executes: 'touch',
    });
    expect(find(r, 'index', 'users_email_idx')).toMatchObject({
      table: 'users',
      unique: true,
      method: 'btree',
      indexColumns: ['lower(email)'],
    });
    expect(find(r, 'index', 'orders(user_id)')).toMatchObject({
      table: 'orders',
      indexColumns: ['user_id'],
    });
    expect(find(r, 'sequence', 'invoice_seq')).toMatchObject({
      ownedBy: 'orders.id',
      table: 'orders',
      options: { start: '100', increment: '5' },
    });
    expect(find(r, 'type', 'mood').values).toEqual(['sad', 'ok', 'happy']);
    expect(find(r, 'type', 'address').columns).toMatchObject([
      { name: 'street', type: 'text' },
      { name: 'zip', type: 'varchar(10)' },
    ]);
    expect(find(r, 'domain', 'positive_int').returns).toBe('int4');
    expect(find(r, 'policy', 'own_orders')).toMatchObject({ table: 'orders', events: ['SELECT'] });
    expect(find(r, 'table', 'users').comment).toBe('People who can sign in');
  });

  it('reports a syntax error with its line and still reads the other statements', () => {
    const b = analyseSql(
      'CREATE TABLE ok (id int);\nCREATE TABLE bad (id int,, x int);\nCREATE VIEW v AS SELECT id FROM ok;',
      'PLpgSQL',
    );
    expect(b.mode).toBe('reader');
    expect(b.problems).toEqual([{ line: 2, message: 'syntax error: syntax error at or near ","' }]);
    expect(find(b, 'view', 'v').reads).toEqual([{ name: 'ok', line: 3 }]);
  });

  it('reports a PL/pgSQL body the compiler rejects', () => {
    const b = analyseSql(
      'CREATE FUNCTION f(INOUT a int) RETURNS int LANGUAGE plpgsql AS $$\nBEGIN RETURN 1; END $$;',
      'PLpgSQL',
    );
    expect(b.problems[0]).toMatchObject({
      line: 1,
      message: expect.stringContaining('PL/pgSQL body of f'),
    });
  });

  it('ignores psql meta-commands and COPY data, keeping line numbers', () => {
    const text =
      '\\set ON_ERROR_STOP on\nCOPY t (a) FROM stdin;\n1\n2\n\\.\nCREATE VIEW v AS SELECT a FROM t WHERE a = :x;';
    expect(blankClientInput(text).split('\n')).toHaveLength(6);
    const b = analyseSql(text, 'PLpgSQL');
    expect(b.problems).toEqual([]);
    expect(find(b, 'view', 'v')).toMatchObject({ line: 6, reads: [{ name: 't', line: 6 }] });
  });

  it('keeps byte offsets right with non-ASCII text before a statement', () => {
    const b = analyseSql(
      "COMMENT ON TABLE t IS 'Größe ✓';\nCREATE TABLE t (id int);\nCREATE VIEW v AS\n  SELECT id FROM t;",
      'PLpgSQL',
    );
    expect(find(b, 'view', 'v')).toMatchObject({
      line: 3,
      endLine: 4,
      reads: [{ name: 't', line: 4 }],
    });
    expect(find(b, 'table', 't').comment).toBe('Größe ✓');
  });
});

describe('MySQL through the statement reader', () => {
  const r = () => analyseSql(fixture('mysql.sql'), 'SQL');
  it('reads procedures, functions, triggers, views, indexes and events', () => {
    const x = r();
    expect(x).toMatchObject({
      dialect: 'mysql',
      mode: 'reader',
      statements: 7,
      understood: 7,
      problems: [],
    });
    expect(find(x, 'procedure', 'add_customer')).toMatchObject({
      line: 10,
      endLine: 18,
      params: [
        { name: 'p_name', type: 'VARCHAR(100)', mode: 'in' },
        { name: 'p_id', type: 'INT', mode: 'out' },
      ],
      writes: [
        { name: 'customers', line: 12 },
        { name: 'counters', line: 16 },
      ],
    });
    expect(find(x, 'procedure', 'add_customer').calls).toContainEqual({
      name: 'audit_log',
      line: 14,
      explicit: true,
    });
    expect(find(x, 'function', 'customer_count')).toMatchObject({
      returns: 'INT',
      reads: [{ name: 'customers', line: 23 }],
    });
    expect(find(x, 'trigger', 'customers_bi')).toMatchObject({
      table: 'customers',
      timing: 'BEFORE',
      events: ['INSERT'],
      forEach: 'row',
      writes: [{ name: 'audit', line: 30 }],
    });
    expect(find(x, 'view', 'big_customers')).toMatchObject({
      columns: [{ name: 'id' }, { name: 'customer' }],
      reads: [{ name: 'customers', line: 7 }],
    });
    expect(find(x, 'index', 'idx_name')).toMatchObject({
      table: 'customers',
      indexColumns: ['name(20)'],
    });
    expect(find(x, 'event', 'purge_audit').writes).toEqual([{ name: 'audit', line: 35 }]);
  });
});

describe('SQL Server through the statement reader', () => {
  it('reads @parameters with defaults and OUTPUT, EXEC calls, dynamic SQL, aliased updates and triggers', () => {
    const x = analyseSql(fixture('tsql.sql'), 'TSQL');
    expect(x).toMatchObject({ dialect: 'tsql', statements: 7, understood: 7, problems: [] });
    const p = find(x, 'procedure', 'usp_AddAccount');
    expect(p).toMatchObject({
      schema: 'dbo',
      line: 8,
      endLine: 26,
      params: [
        { name: '@Owner', type: 'NVARCHAR(200)', mode: 'in' },
        { name: '@Balance', type: 'DECIMAL(18, 2)', mode: 'in', default: '0' },
        { name: '@NewId', type: 'INT', mode: 'out' },
      ],
      dynamicSql: [19],
    });
    expect(names(p.writes)).toEqual(['dbo.Accounts', 'dbo.Accounts', 'dbo.Pending']);
    expect(p.calls).toContainEqual({ name: 'usp_Audit', schema: 'dbo', line: 17, explicit: true });
    expect(find(x, 'function', 'fn_Balance')).toMatchObject({
      returns: 'DECIMAL(18, 2)',
      reads: [{ name: 'Ledger', schema: 'dbo', line: 31 }],
    });
    expect(find(x, 'trigger', 'trg_Accounts')).toMatchObject({
      table: 'Accounts',
      timing: 'AFTER',
      events: ['INSERT', 'UPDATE'],
      forEach: 'statement',
    });
    expect(find(x, 'index', 'IX_Accounts_Owner')).toMatchObject({
      table: 'Accounts',
      indexColumns: ['Owner'],
    });
  });
});

describe('Oracle through the statement reader', () => {
  it('reads IN OUT parameters, package specifications and bodies with their members', () => {
    const x = analyseSql(fixture('oracle.sql'), 'PLSQL');
    expect(x).toMatchObject({ dialect: 'oracle', problems: [] });
    expect(find(x, 'procedure', 'raise_salary')).toMatchObject({
      line: 9,
      endLine: 17,
      params: [
        { name: 'p_empno', type: 'NUMBER', mode: 'in' },
        { name: 'p_pct', type: 'NUMBER', mode: 'inout' },
        { name: 'p_msg', type: 'VARCHAR2', mode: 'out' },
      ],
      reads: [{ name: 'emp', line: 12 }],
      writes: [{ name: 'emp', line: 13 }],
      calls: [{ name: 'log_change', schema: 'audit_pkg', line: 14 }],
      dynamicSql: [15],
    });
    expect(find(x, 'package', 'audit_pkg')).toMatchObject({ line: 20, endLine: 23 });
    expect(find(x, 'function', 'changes_today', 'audit_pkg')).toBeDefined();
    const bodyMembers = x.objects.filter((o) => o.parent === 'audit_pkg' && o.line > 25);
    expect(bodyMembers.map((o) => [o.kind, o.name, o.line, o.endLine])).toEqual([
      ['procedure', 'log_change', 27, 30],
      ['function', 'changes_today', 32, 37],
    ]);
    expect(bodyMembers[0]!.writes).toEqual([{ name: 'audit_log', line: 29 }]);
    expect(bodyMembers[1]).toMatchObject({
      returns: 'NUMBER',
      reads: [{ name: 'audit_log', line: 35 }],
    });
    expect(find(x, 'trigger', 'emp_bi')).toMatchObject({
      table: 'emp',
      timing: 'BEFORE',
      forEach: 'row',
    });
    expect(find(x, 'type', 'point_t').columns).toMatchObject([
      { name: 'x', type: 'NUMBER' },
      { name: 'y', type: 'NUMBER' },
    ]);
    expect(find(x, 'sequence', 'emp_seq').options).toEqual({ start: '1000', increment: '1' });
  });
});

describe('Db2 and SQLite', () => {
  it('reads Db2 SQL PL with a custom terminator', () => {
    const x = analyseSql(fixture('db2.sql'), 'SQL');
    expect(x).toMatchObject({ dialect: 'db2', statements: 2, understood: 2, problems: [] });
    expect(find(x, 'procedure', 'bump_stock')).toMatchObject({
      language: 'sql',
      writes: [
        { name: 'stock', line: 6 },
        { name: 'stock_log', line: 7 },
      ],
    });
    expect(find(x, 'function', 'stock_of')).toMatchObject({
      returns: 'INT',
      reads: [{ name: 'stock', line: 12 }],
    });
  });
  it('reads SQLite: statements PostgreSQL accepts through its parser, the rest by the reader', () => {
    const x = analyseSql(fixture('sqlite.sql'), 'SQL');
    expect(x.dialect).toBe('sqlite');
    expect(x.parsedStatements).toBeGreaterThan(0);
    expect(x.understood).toBe(x.statements);
    expect(find(x, 'trigger', 'notes_ai')).toMatchObject({
      table: 'notes',
      timing: 'AFTER',
      forEach: 'row',
      writes: [{ name: 'note_log', line: 6 }],
    });
    expect(find(x, 'view', 'tagged').reads).toEqual([{ name: 'notes', line: 4 }]);
  });
});

describe('reference reading', () => {
  it('does not take CTEs, temporary tables, EXTRACT(… FROM …) or IS DISTINCT FROM for tables', () => {
    const x = analyseSql(
      'CREATE PROCEDURE p() BEGIN\n  CREATE TEMPORARY TABLE tmp (id INT);\n  INSERT INTO tmp SELECT id FROM real_a;\n  WITH c AS (SELECT 1 FROM real_b) SELECT EXTRACT(YEAR FROM d) FROM c WHERE a IS DISTINCT FROM b;\nEND',
      'SQL',
    );
    const p = find(x, 'procedure', 'p');
    expect(names(p.reads)).toEqual(['real_a', 'real_b']);
    expect(p.writes).toBeUndefined();
  });
  it('says what it cannot read', () => {
    const x = analyseSql('FROBNICATE everything;', 'TSQL');
    expect(x.problems).toEqual([
      { line: 1, message: 'statement not recognised: FROBNICATE everything' },
    ]);
    expect(analyseSql('', 'SQL')).toMatchObject({ statements: 0, objects: [], problems: [] });
  });
});

describe('query lists without semicolons', () => {
  // The shape of generated query snapshots (for example Immich's server/src/queries/*.sql).
  const text = [
    '-- NOTE: This file is auto generated',
    '',
    '-- UserRepository.get',
    'select',
    '  "user"."id"',
    'from',
    '  "user"',
    'where',
    '  "user"."id" = $1',
    '',
    '-- UserRepository.update',
    'update "user"',
    'set',
    '  "name" = $1',
    'where',
    '  "id" = $2',
    '',
  ].join('\n');

  it('finds where each query starts', () => {
    expect(unterminatedQueries(text).map((p) => text.slice(p.start).split('\n')[0])).toEqual([
      '-- NOTE: This file is auto generated',
      'update "user"',
    ]);
    // A transaction written out line by line splits into its statements.
    const tx =
      '-- R.replace\nbegin\ndelete from "t"\nwhere\n  "id" = $1\nrollback\n\nSHOW server_version\n';
    expect(unterminatedQueries(tx).map((p) => tx.slice(p.start, p.end).trim())).toEqual([
      '-- R.replace\nbegin',
      'delete from "t"\nwhere\n  "id" = $1',
      'rollback',
      'SHOW server_version',
    ]);
    // A keyword inside a statement, or indented, never starts a new one.
    expect(unterminatedQueries('select a\nfrom t\nwhere b in (\nselect c from d)\n')).toEqual([]);
  });

  it('parses every query with the PostgreSQL parser and reports the file as fully parsed', () => {
    const r = analyseSql(text, 'SQL');
    expect(r).toMatchObject({ mode: 'parser', statements: 2, understood: 2, problems: [] });
    expect(r.parsedStatements).toBe(2);
  });

  it('keeps the old reading when a piece still does not parse', () => {
    const r = analyseSql(`${text}\nselect from where\n`, 'SQL');
    expect(r.mode).toBe('reader');
    expect(r.problems.length).toBeGreaterThan(0);
  });
});
