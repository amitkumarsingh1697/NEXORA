import type { GraphBuilder } from './model';

export interface DocSection {
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  body: string;
}

/** Split markdown into heading sections (fenced code is kept with its section). */
export function splitMarkdown(text: string): DocSection[] {
  const lines = text.split('\n');
  const out: DocSection[] = [];
  let cur: DocSection = { heading: '', level: 0, startLine: 1, endLine: 1, body: '' };
  let inFence = false;
  const flush = (end: number) => {
    cur.endLine = end;
    if (cur.body.trim()) out.push(cur);
  };
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      flush(i);
      cur = {
        heading: (h[2] ?? '').trim(),
        level: (h[1] ?? '#').length,
        startLine: i + 1,
        endLine: i + 1,
        body: `${line}\n`,
      };
    } else cur.body += `${line}\n`;
  });
  flush(lines.length);
  return out;
}

const ADR_RE = /(^|\/)(adr|adrs|decisions?)\/|ARCHITECTURE_DECISIONS|(^|\/)\d{3,4}-[\w-]+\.md$/i;

/**
 * Index a markdown file as knowledge: a doc node per file, FTS chunks per
 * section, and inferred "mentions" edges to files and exported symbols the
 * text names in backticks or as paths.
 */
export function indexMarkdown(
  graph: GraphBuilder,
  path: string,
  text: string,
  filePaths: Set<string>,
  exportedByName: Map<string, string[]>,
  moduleOf: (p: string) => string,
): number {
  const sections = splitMarkdown(text);
  const title = sections.find((s) => s.level === 1)?.heading ?? path.split('/').pop() ?? path;
  const doc = graph.addNode({
    kind: 'doc',
    key: path,
    name: title,
    filePath: path,
    module: moduleOf(path),
    startLine: 1,
    endLine: text.split('\n').length,
    data: { sections: sections.length, adr: ADR_RE.test(path) || /^#\s*ADR/im.test(text) },
  });
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  let mentions = 0;
  for (const s of sections) {
    graph.chunks.push({
      filePath: path,
      startLine: s.startLine,
      endLine: s.endLine,
      kind: 'doc',
      body: s.body.slice(0, 8000),
      symbolKey: s.heading || undefined,
    });
    const seen = new Set<string>();
    const tokens = [...s.body.matchAll(/`([^`\n]{2,120})`/g)]
      .map((m) => m[1] as string)
      .concat([...s.body.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)].map((m) => m[1] as string));
    for (const raw of tokens) {
      const t = raw.replace(/^\.\//, '').replace(/[()]/g, '').trim();
      const asPath = filePaths.has(t)
        ? t
        : dir && filePaths.has(`${dir}/${t}`)
          ? `${dir}/${t}`
          : null;
      const line = s.startLine + (s.body.slice(0, s.body.indexOf(raw)).match(/\n/g)?.length ?? 0);
      if (asPath && !seen.has(asPath)) {
        seen.add(asPath);
        graph.addEdge({
          kind: 'mentions',
          src: doc,
          dst: { kind: 'file', key: asPath },
          confidence: 'inferred',
          evidencePath: path,
          evidenceLine: line,
          detail: 'path named in documentation',
        });
        mentions++;
        continue;
      }
      const ident = /^([A-Za-z_$][\w$]*)(\(\))?$/.exec(t)?.[1];
      const keys = ident ? exportedByName.get(ident) : undefined;
      if (keys && keys.length === 1 && !seen.has(keys[0] as string)) {
        seen.add(keys[0] as string);
        graph.addEdge({
          kind: 'mentions',
          src: doc,
          dst: { kind: 'symbol', key: keys[0] as string },
          confidence: 'inferred',
          evidencePath: path,
          evidenceLine: line,
          detail: 'identifier named in documentation',
        });
        mentions++;
      }
    }
  }
  return mentions;
}
