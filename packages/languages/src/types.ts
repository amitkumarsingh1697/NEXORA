/**
 * Shared vocabulary for language and file-format support (CodeAtlas and ArchLens).
 * See documentation/architecture/adr/0014-language-and-file-format-registry.md.
 */

/** What kind of technology a language or format is. */
export const CATEGORIES = [
  'programming',
  'scripting',
  'database',
  'markup',
  'stylesheet',
  'template',
  'config',
  'data',
  'build',
  'infrastructure',
  'api',
  'docs',
  'notebook',
  'binary',
  'unknown',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  programming: 'Programming language',
  scripting: 'Scripting and automation',
  database: 'Database language',
  markup: 'Markup',
  stylesheet: 'Stylesheet',
  template: 'Template',
  config: 'Configuration',
  data: 'Data and serialization',
  build: 'Build system',
  infrastructure: 'Infrastructure as code',
  api: 'API and interface definition',
  docs: 'Documentation',
  notebook: 'Notebook',
  binary: 'Binary',
  unknown: 'Unrecognised',
};

/**
 * What was done to one file, from the processing result (never from the format's name).
 *
 * - `full`: a complete parser read the whole file and the meaning of its file type was extracted.
 * - `partial`: either a complete parse with no model of the file's meaning, or pattern-based
 *   extraction of declarations, imports or blocks that is not a full parse.
 * - `text`: read as text and indexed for search only; no structure extracted.
 * - `unsupported`: recognised, but its content could not be used (for example a Git LFS pointer,
 *   or an encoding that cannot be decoded).
 * - `failed`: an analyser tried and failed; the reason is recorded.
 * - `excluded`: deliberately not read (credentials, limits, build output, generated, ignored).
 * - `binary`: binary content; recorded, not read.
 */
export const STATUSES = [
  'full',
  'partial',
  'text',
  'unsupported',
  'failed',
  'excluded',
  'binary',
] as const;
export type FileStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<FileStatus, string> = {
  full: 'Fully analysed',
  partial: 'Partially analysed',
  text: 'Text only (searchable)',
  unsupported: 'Recognised, not readable',
  failed: 'Failed to analyse',
  excluded: 'Excluded',
  binary: 'Binary',
};

/** How the language was identified. */
export type DetectedBy =
  | 'filename'
  | 'extension'
  | 'shebang'
  | 'modeline'
  | 'content'
  | 'heuristic'
  | 'magic'
  | 'fallback';

export interface Classification {
  /** Language or format name (GitHub Linguist names where Linguist knows the format). */
  language: string;
  category: Category;
  detectedBy: DetectedBy;
  /** observed: an unambiguous rule matched; inferred: a heuristic or default chose among candidates. */
  confidence: 'observed' | 'inferred';
  /** Other languages the same extension can mean, when the choice was a default or heuristic. */
  alternatives?: string[];
  /** File type, for build, deployment, CI, schema and other non-source files. */
  role?: RoleId;
  /** Binary kind, when the content is binary. */
  binaryKind?: string;
  /** Set when the text is a Git LFS pointer, not the real file. */
  lfsPointer?: boolean;
  /** Text encoding, when not UTF-8 (for example utf-16le). */
  encoding?: 'utf-8' | 'utf-16le' | 'utf-16be';
}

export type RoleGroup =
  | 'container'
  | 'orchestration'
  | 'ci'
  | 'build'
  | 'dependencies'
  | 'lockfile'
  | 'compiler'
  | 'iac'
  | 'database'
  | 'api'
  | 'schema'
  | 'config'
  | 'env'
  | 'docs'
  | 'repo'
  | 'test';

export type RoleId = string;

export interface RoleInfo {
  id: RoleId;
  label: string;
  group: RoleGroup;
  /** How the file type is identified: the path pattern, and the content check if there is one. */
  pathPattern?: string;
  contentPattern?: string;
}

export const ROLE_GROUP_LABEL: Record<RoleGroup, string> = {
  container: 'Containers',
  orchestration: 'Orchestration (Kubernetes, Helm, Kustomize)',
  ci: 'CI/CD pipelines',
  build: 'Build systems',
  dependencies: 'Dependency manifests',
  lockfile: 'Lockfiles',
  compiler: 'Compiler and tool configuration',
  iac: 'Infrastructure as code',
  database: 'Database schemas, migrations and procedures',
  api: 'API specifications and interface definitions',
  schema: 'Schema and data definitions',
  config: 'Application configuration',
  env: 'Environment templates',
  docs: 'Documentation and specifications',
  repo: 'Repository metadata',
  test: 'Test files',
};
