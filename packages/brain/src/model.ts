/**
 * Data model of the architecture brain. CodeAtlas builds it from its index; ArchLens can
 * write it by hand from source it has read. The viewer renders any valid model.
 *
 * Every synapse carries a confidence label (observed / inferred / unknown) and, where
 * known, the file and line it was read from. Region placement is always an inference
 * from paths and imports, and each neuron says why it was placed where it is.
 */
export const BRAIN_FORMAT = 1;

export const REGION_IDS = ['frontend', 'backend', 'database', 'devops', 'core'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export interface BrainRegion {
  id: RegionId;
  label: string;
  description: string;
}

export const DEFAULT_REGIONS: BrainRegion[] = [
  {
    id: 'frontend',
    label: 'Frontend',
    description: 'User interface: pages, components, hooks, styles and browser code.',
  },
  {
    id: 'backend',
    label: 'Backend',
    description: 'Servers, API routes, handlers, services and middleware.',
  },
  {
    id: 'database',
    label: 'Database',
    description: 'Schemas, migrations, data access and database clients.',
  },
  {
    id: 'devops',
    label: 'DevOps',
    description: 'Build, CI, deployment, infrastructure, scripts and tool configuration.',
  },
  {
    id: 'core',
    label: 'Core & shared',
    description: 'Domain logic and libraries used across the other parts.',
  },
];

export const NEURON_KINDS = [
  'class',
  'interface',
  'function',
  'method',
  'component',
  'route',
  'file',
  'database',
  'service',
  'config',
  'table',
] as const;
export type NeuronKind = (typeof NEURON_KINDS)[number];

export const SYNAPSE_KINDS = [
  'calls',
  'renders',
  'extends',
  'implements',
  'instantiates',
  'handles',
  'accesses_db',
  'reads_config',
  'writes_config',
  'calls_service',
  'imports',
  'starts',
  'reads_table',
  'writes_table',
  'references',
] as const;
export type SynapseKind = (typeof SYNAPSE_KINDS)[number];

export const CONFIDENCES = ['observed', 'inferred', 'unknown'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export interface BrainParam {
  name: string;
  type: string;
  optional?: boolean;
}

/** A database column, as written in the schema. */
export interface BrainColumn {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: string;
  references?: { table: string; column?: string };
  line?: number;
}

export interface BrainNeuron {
  id: string;
  name: string;
  kind: NeuronKind;
  /** Omit to let the viewer place it from `file`. */
  region?: RegionId;
  /** Why it is in that region (always an inference from path or imports). */
  regionReason?: string;
  /** Enclosing neuron, such as the class of a method. */
  parent?: string;
  file?: string;
  line?: number;
  signature?: string;
  params?: BrainParam[];
  returns?: string;
  /** True when the source wrote the return type; false when TypeScript worked it out. */
  returnsDeclared?: boolean;
  doc?: string;
  /** Columns of a `table` neuron. */
  columns?: BrainColumn[];
  /** Opaque reference back to the producer (for example a CodeAtlas node id). */
  ref?: number | string;
}

export interface BrainSynapse {
  source: string;
  target: string;
  kind: SynapseKind;
  confidence: Confidence;
  file?: string;
  line?: number;
  detail?: string;
}

export interface BrainModel {
  format: typeof BRAIN_FORMAT;
  title: string;
  source: {
    producer: 'codeatlas' | 'archlens' | string;
    repository: string;
    revision?: string;
    generatedAt: string;
  };
  regions?: BrainRegion[];
  neurons: BrainNeuron[];
  synapses: BrainSynapse[];
  /** Coverage and limits the reader should know about. */
  notes?: string[];
}

export type ValidationResult =
  { ok: true; model: BrainModel; warnings: string[] } | { ok: false; errors: string[] };

const MAX_NEURONS = 20_000;
const MAX_SYNAPSES = 100_000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 2000): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined;

const posInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e6 ? v : undefined;

function columnsOf(raw: unknown[]): BrainColumn[] {
  return raw
    .filter(isObj)
    .filter((c) => typeof c.name === 'string' && c.name)
    .slice(0, 500)
    .map((c) => {
      const ref = isObj(c.references) ? c.references : undefined;
      const col: BrainColumn = {
        name: (c.name as string).slice(0, 120),
        type: str(c.type, 120) ?? 'unknown',
        nullable: c.nullable !== false,
      };
      const length = posInt(c.length);
      const precision = posInt(c.precision);
      const scale = posInt(c.scale);
      if (length !== undefined) col.length = length;
      if (precision !== undefined) col.precision = precision;
      if (scale !== undefined) col.scale = scale;
      if (c.primaryKey === true) col.primaryKey = true;
      if (c.unique === true) col.unique = true;
      const def = str(c.default, 120);
      if (def !== undefined) col.default = def;
      if (ref && typeof ref.table === 'string')
        col.references = { table: ref.table.slice(0, 200), column: str(ref.column, 120) };
      const line = posInt(c.line);
      if (line) col.line = line;
      return col;
    });
}

/**
 * Checks a model from an untrusted producer (a hand-written JSON file, an API response).
 * Unknown kinds and dangling synapses are dropped with a warning rather than failing,
 * so a mostly-correct model still renders; structural problems fail.
 */
export function validateBrain(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['The brain model must be a JSON object.'] };
  if (input.format !== BRAIN_FORMAT)
    errors.push(`"format" must be ${BRAIN_FORMAT} (got ${JSON.stringify(input.format)}).`);
  if (!Array.isArray(input.neurons)) errors.push('"neurons" must be an array.');
  if (!Array.isArray(input.synapses)) errors.push('"synapses" must be an array.');
  if (errors.length) return { ok: false, errors };
  const rawNeurons = input.neurons as unknown[];
  const rawSynapses = input.synapses as unknown[];
  if (rawNeurons.length > MAX_NEURONS)
    return { ok: false, errors: [`Too many neurons (${rawNeurons.length} > ${MAX_NEURONS}).`] };
  if (rawSynapses.length > MAX_SYNAPSES)
    return { ok: false, errors: [`Too many synapses (${rawSynapses.length} > ${MAX_SYNAPSES}).`] };

  const neurons: BrainNeuron[] = [];
  const ids = new Set<string>();
  rawNeurons.forEach((n, i) => {
    if (!isObj(n) || typeof n.id !== 'string' || !n.id || typeof n.name !== 'string') {
      warnings.push(`neurons[${i}] has no id or name and was skipped.`);
      return;
    }
    if (ids.has(n.id)) {
      warnings.push(`Duplicate neuron id "${n.id}" was skipped.`);
      return;
    }
    const kind = (NEURON_KINDS as readonly string[]).includes(n.kind as string)
      ? (n.kind as NeuronKind)
      : 'function';
    if (kind !== n.kind) warnings.push(`Neuron "${n.id}" has unknown kind; shown as function.`);
    const region = (REGION_IDS as readonly string[]).includes(n.region as string)
      ? (n.region as RegionId)
      : undefined;
    const params = Array.isArray(n.params)
      ? n.params
          .filter(isObj)
          .slice(0, 50)
          .map((p) => ({
            name: str(p.name, 120) ?? '?',
            type: str(p.type, 300) ?? 'unknown',
            optional: p.optional === true,
          }))
      : undefined;
    ids.add(n.id);
    neurons.push({
      id: n.id,
      name: n.name.slice(0, 300),
      kind,
      region,
      regionReason: str(n.regionReason, 300),
      parent: str(n.parent, 2000),
      file: str(n.file, 1000),
      line: typeof n.line === 'number' && n.line > 0 ? Math.floor(n.line) : undefined,
      signature: str(n.signature, 600),
      params,
      returns: str(n.returns, 300),
      returnsDeclared: typeof n.returnsDeclared === 'boolean' ? n.returnsDeclared : undefined,
      doc: str(n.doc, 1000),
      columns: Array.isArray(n.columns) ? columnsOf(n.columns) : undefined,
      ref: typeof n.ref === 'number' || typeof n.ref === 'string' ? n.ref : undefined,
    });
  });
  for (const n of neurons) if (n.parent && !ids.has(n.parent)) delete n.parent;

  const synapses: BrainSynapse[] = [];
  let dangling = 0;
  rawSynapses.forEach((s) => {
    if (!isObj(s) || typeof s.source !== 'string' || typeof s.target !== 'string') return;
    if (!ids.has(s.source) || !ids.has(s.target) || s.source === s.target) {
      dangling++;
      return;
    }
    const kind = (SYNAPSE_KINDS as readonly string[]).includes(s.kind as string)
      ? (s.kind as SynapseKind)
      : 'calls';
    const confidence = (CONFIDENCES as readonly string[]).includes(s.confidence as string)
      ? (s.confidence as Confidence)
      : 'unknown';
    synapses.push({
      source: s.source,
      target: s.target,
      kind,
      confidence,
      file: str(s.file, 1000),
      line: typeof s.line === 'number' && s.line > 0 ? Math.floor(s.line) : undefined,
      detail: str(s.detail, 300),
    });
  });
  if (dangling)
    warnings.push(`${dangling} synapse(s) pointed at unknown neurons and were skipped.`);

  const source = isObj(input.source) ? input.source : {};
  const regions = Array.isArray(input.regions)
    ? input.regions
        .filter(isObj)
        .filter((r) => (REGION_IDS as readonly string[]).includes(r.id as string))
        .map((r) => ({
          id: r.id as RegionId,
          label: str(r.label, 60) ?? (r.id as string),
          description: str(r.description, 300) ?? '',
        }))
    : undefined;
  return {
    ok: true,
    warnings,
    model: {
      format: BRAIN_FORMAT,
      title: str(input.title, 200) ?? 'Architecture brain',
      source: {
        producer: str(source.producer, 60) ?? 'unknown',
        repository: str(source.repository, 500) ?? '',
        revision: str(source.revision, 80),
        generatedAt: str(source.generatedAt, 40) ?? '',
      },
      regions: regions?.length ? regions : undefined,
      neurons,
      synapses,
      notes: Array.isArray(input.notes)
        ? input.notes.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 500))
        : undefined,
    },
  };
}
