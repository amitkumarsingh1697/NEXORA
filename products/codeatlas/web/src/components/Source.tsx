import { api } from '../api';
import { ErrorBox, Spinner, useAsync, cn } from './ui';

interface SourceResp {
  path: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

/** Read-only source excerpt from the working tree, with line numbers. */
export function Source({
  repoId,
  path,
  start,
  end,
  highlight,
}: {
  repoId: number;
  path: string;
  start: number;
  end: number;
  highlight?: [number, number];
}) {
  const { data, error, loading } = useAsync(
    () =>
      api<SourceResp>(
        `/api/repos/${repoId}/source?path=${encodeURIComponent(path)}&start=${start}&end=${end}`,
      ),
    [repoId, path, start, end],
  );
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;
  return (
    <div className="overflow-auto rounded-lg border border-line bg-canvas">
      <div className="border-b border-line px-3 py-1.5 font-mono text-[11px] text-muted">
        {data.path}:{data.startLine}-{data.endLine}
      </div>
      <pre className="text-[12px] leading-5">
        {data.lines.map((l, i) => {
          const n = data.startLine + i;
          const hot = highlight && n >= highlight[0] && n <= highlight[1];
          return (
            <div key={n} className={cn('flex', hot && 'bg-accent/10')}>
              <span className="w-12 shrink-0 select-none pr-3 text-right text-muted">{n}</span>
              <code className="whitespace-pre pr-4">{l || ' '}</code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
