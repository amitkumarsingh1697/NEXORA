/** What a SQL file contains, as read by the PostgreSQL parser or the statement reader. */

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'tsql' | 'oracle' | 'db2' | 'generic';

export const DIALECT_LABEL: Record<Dialect, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL/MariaDB',
  sqlite: 'SQLite',
  tsql: 'SQL Server (T-SQL)',
  oracle: 'Oracle (PL/SQL)',
  db2: 'Db2 (SQL PL)',
  generic: 'SQL',
};

export type SqlObjectKind =
  | 'table'
  | 'view'
  | 'materialized-view'
  | 'function'
  | 'procedure'
  | 'trigger'
  | 'index'
  | 'sequence'
  | 'type'
  | 'domain'
  | 'package'
  | 'package-body'
  | 'type-body'
  | 'schema'
  | 'extension'
  | 'policy'
  | 'rule'
  | 'synonym'
  | 'event';

export type ParamMode = 'in' | 'out' | 'inout' | 'variadic' | 'table';

export interface SqlParam {
  name: string;
  /** Type as written (PostgreSQL: as the parser normalised it, `int4` for `int`). */
  type: string;
  mode: ParamMode;
  default?: string;
}

export interface SqlColumn {
  name: string;
  type?: string;
  nullable?: boolean;
  primaryKey?: boolean;
  default?: string;
  line?: number;
  /** COMMENT ON COLUMN text. */
  comment?: string;
}

/** A name used in a body or definition, with the line it is written on. */
export interface SqlRef {
  name: string;
  /** Schema or package qualifier, as written. */
  schema?: string;
  line: number;
  /** A call written as CALL, EXEC, PERFORM or a trigger's EXECUTE: certainly a routine. */
  explicit?: boolean;
}

export interface SqlObject {
  kind: SqlObjectKind;
  /** Name without schema, as written (quotes removed). */
  name: string;
  schema?: string;
  line: number;
  endLine: number;
  /** For members of a package body or specification: the package name. */
  parent?: string;
  /** The header as written, up to the body, on one line. */
  signature?: string;
  params?: SqlParam[];
  returns?: string;
  /** Implementation language (plpgsql, sql, c…), when declared. */
  language?: string;
  /** View and table columns; composite and table type attributes. */
  columns?: SqlColumn[];
  /** Enum labels. */
  values?: string[];
  /** Tables, views and other relations read in the body or the view query. */
  reads?: SqlRef[];
  /** Relations written (INSERT, UPDATE, DELETE, MERGE, TRUNCATE). */
  writes?: SqlRef[];
  /** Functions and procedures called in the body. */
  calls?: SqlRef[];
  /** Lines where a statement is built at run time (EXECUTE, sp_executesql…): not analysed. */
  dynamicSql?: number[];
  /** Trigger, index, policy, rule and sequence target. */
  table?: string;
  /** Trigger timing and events. */
  timing?: string;
  events?: string[];
  forEach?: 'row' | 'statement';
  /** Trigger: the function or procedure it runs, when named. */
  executes?: string;
  /** Index columns or expressions, as written. */
  indexColumns?: string[];
  unique?: boolean;
  method?: string;
  /** Sequence options (start, increment…), and the column a sequence belongs to. */
  options?: Record<string, string>;
  ownedBy?: string;
  /** COMMENT ON text. */
  comment?: string;
}

export interface SqlProblem {
  line: number;
  message: string;
}

export interface SqlResult {
  dialect: Dialect;
  /** How the file was read: `parser` (every statement parsed by a real grammar) or `reader`. */
  mode: 'parser' | 'reader';
  /** Parser or reader name and version, for the file status. */
  method: string;
  statements: number;
  /** Statements recognised, by the parser or the reader. */
  understood: number;
  /** Statements parsed by a complete grammar (PostgreSQL's parser). */
  parsedStatements?: number;
  objects: SqlObject[];
  /** COMMENT ON … IS '…' statements, for the objects and columns they describe. */
  comments: SqlComment[];
  /** Syntax errors and statements that could not be read, with their line. */
  problems: SqlProblem[];
}

export interface SqlComment {
  /** table, view, column, function, procedure, … (lower case). */
  on: string;
  name: string;
  /** For a column comment: the column. */
  column?: string;
  text: string;
  line: number;
}
