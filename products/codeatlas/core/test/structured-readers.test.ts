import { describe, expect, it } from 'vitest';
import {
  neutraliseJsonTemplates,
  neutraliseTemplates,
  readDelimited,
  readDot,
  readGettext,
  readJson,
  readYaml,
  splitConcatenatedJson,
} from '../src/indexer/extract/structured';

describe('templated YAML and JSON', () => {
  it('reads a Helm template with placeholders, keeps line numbers, and labels it partial', () => {
    const helm = [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      '  name: {{ include "app.fullname" . }}',
      '  labels:',
      '    {{- include "app.labels" . | nindent 4 }}',
      'spec:',
      '  {{- if .Values.replicas }}',
      '  replicas: {{ .Values.replicas }}',
      '  {{- end }}',
      '  template:',
      '    spec:',
      '      containers:',
      '        - name: app',
      '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"',
    ].join('\n');
    const n = neutraliseTemplates(helm);
    expect(n.split('\n')).toHaveLength(helm.split('\n').length);
    const r = readYaml('chart/templates/deployment.yaml', helm, undefined);
    expect(r.error).toBeUndefined();
    expect(r.skipReason).toBeUndefined();
    expect(r.level).toBe('partial');
    expect(r.method).toMatch(/template placeholders not rendered/);
    expect(r.facts.template).toBe(true);
  });

  it('keeps a template that is still not YAML with placeholders as text, with the reason', () => {
    const r = readYaml('x.yaml', 'a: {{ x }}\n  b: [\n', undefined);
    expect(r.skipReason).toMatch(/not valid YAML even with its template tags replaced/);
  });

  it('reads a JSON Pod manifest with placeholders inside and outside strings', () => {
    const manifest =
      '{\n"apiVersion": "v1",\n"kind": "Pod",\n"metadata": {"name": "etcd-server{{ suffix }}"},\n"spec": {"port": {{ port }}, "env": ${TEST_REALM}, "on": ${ENABLED:true}}\n}';
    expect(() => JSON.parse(neutraliseJsonTemplates(manifest))).not.toThrow();
    const r = readJson('cluster/gce/manifests/etcd.manifest', manifest, undefined, 'JSON');
    expect(r.error).toBeUndefined();
    expect(r.level).toBe('partial');
    expect(r.facts.topLevelKeys).toEqual(['apiVersion', 'kind', 'metadata', 'spec']);
  });

  it('still fails a JSON file that is broken for another reason', () => {
    expect(readJson('a.json', '{"a": 1,, }', undefined, 'JSON').error).toMatch(/invalid JSON/);
  });
});

describe('several JSON documents in one file', () => {
  it('reads them as a sequence', () => {
    const text = '{"kind": "Pod", "s": "a}b"}\n{"kind": "Service"}\n[1, 2]\n';
    expect(splitConcatenatedJson(text)).toHaveLength(3);
    const r = readJson('hack/testdata/multi.json', text, undefined, 'JSON');
    expect(r).toMatchObject({ level: 'partial', facts: { documents: 3 } });
    expect(r.method).toMatch(/3 concatenated documents/);
  });
  it('does not treat one broken document as a sequence', () => {
    expect(splitConcatenatedJson('{"a": 1}')).toBeUndefined();
    expect(splitConcatenatedJson('{"a": 1} {"b": ')).toBeUndefined();
  });
});

describe('CSV and TSV', () => {
  it('counts rows and columns, handles quotes, and keeps no cell values', () => {
    const r = readDelimited(
      'auth-tokens.csv',
      'admin-token,admin,,"system:masters"\nt2,u2,"a,b",g\n',
    );
    expect(r).toMatchObject({ level: 'full', facts: { rows: 2, columns: 4 } });
    expect(JSON.stringify(r)).not.toMatch(/admin-token|system:masters/);
  });
  it('is partial when rows differ, and fails on an unterminated quote', () => {
    expect(readDelimited('a.tsv', 'a\tb\nc\n').level).toBe('partial');
    expect(readDelimited('a.csv', 'a,"b\n').error).toMatch(/unterminated/);
  });
});

describe('Graphviz', () => {
  it('reads the graph, its nodes and edges', () => {
    const r = readDot(
      'digraph "gc" {\n  // owners\n  "a" -> "b";\n  b -> c [label="x"];\n  d [shape=box];\n}\n',
    );
    expect(r.facts).toMatchObject({ graph: 'gc', directed: true, nodes: 4, edges: 2 });
    expect(r.symbols.map((s) => s.name)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('treats a .dot file with no graph as text (doT.js templates use the same extension)', () => {
    expect(readDot('<div>{{=it.name}}</div>').skipReason).toMatch(/no graph statement/);
  });
});

describe('gettext catalogs', () => {
  it('counts messages and reads the language from the header', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '"Language: de_DE\\n"',
      '',
      '#: cmd.go:10',
      'msgid "Delete a resource"',
      'msgstr "Eine Ressource löschen"',
      '',
      'msgid "one pod"',
      'msgid_plural "%d pods"',
      'msgstr[0] "ein Pod"',
      'msgstr[1] "%d Pods"',
    ].join('\n');
    expect(readGettext(po)).toMatchObject({
      level: 'full',
      facts: { messages: 2, pluralForms: 1, language: 'de_DE' },
    });
  });
});

describe('GitHub Actions expressions are not templates', () => {
  it('reads a workflow with ${{ }} expressions as a full GitHub Actions file', () => {
    const wf =
      'name: ci\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ github.sha }}\n';
    const r = readYaml('.github/workflows/ci.yml', wf, 'github-actions');
    expect(r.method).not.toMatch(/template/);
    expect(r.level).toBe('full');
  });
});
