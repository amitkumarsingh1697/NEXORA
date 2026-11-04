import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Confidence } from '../types';

export function cn(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  small?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-90',
        variant === 'secondary' && 'border border-line bg-panel hover:bg-canvas',
        variant === 'danger' && 'border border-danger/40 text-danger hover:bg-danger/10',
        variant === 'ghost' && 'text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  observed: 'border-observed/40 text-observed',
  inferred: 'border-inferred/40 text-inferred',
  unknown: 'border-unknown/40 text-unknown',
};

export const CONF_HELP: Record<Confidence, string> = {
  observed: 'Resolved by the TypeScript compiler or declared in configuration.',
  inferred:
    'Linked by a heuristic (framework convention, unique name, docs). Verify before relying on it.',
  unknown: 'Seen in the code but could not be resolved.',
};

export function ConfidenceBadge({ c }: { c: Confidence }) {
  return (
    <span
      title={CONF_HELP[c]}
      className={cn(
        'inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        CONF_STYLE[c],
      )}
    >
      {c}
    </span>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0 w-6 border-t-2 border-observed" /> observed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0 w-6 border-t-2 border-dashed border-inferred" /> inferred
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0 w-6 border-t-2 border-dotted border-unknown" /> unknown
      </span>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1 text-xs text-muted">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/** Load data; reload when deps change. */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): { data: T | undefined; error: unknown; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => id === seq.current && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        id === seq.current && setState({ data: undefined, error, loading: false }),
    );
  }, deps);
  useEffect(() => run(), [run]);
  return { ...state, reload: run };
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
