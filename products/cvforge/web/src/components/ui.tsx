'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-white text-ink border border-line hover:bg-canvas',
  ghost: 'text-ink hover:bg-canvas',
  danger: 'bg-missing text-white hover:opacity-90',
  success: 'bg-demonstrated text-white hover:opacity-90',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: 'sm' | 'md';
    loading?: boolean;
  }
>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function Card({
  className,
  children,
  title,
  actions,
  description,
}: {
  className?: string;
  children?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-5 shadow-sm', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'demonstrated' | 'confirmed' | 'missing' | 'pending';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-canvas text-muted border-line',
    brand: 'bg-brand-soft text-brand border-brand-soft',
    demonstrated: 'bg-demonstrated-soft text-demonstrated border-demonstrated-soft',
    confirmed: 'bg-confirmed-soft text-confirmed border-confirmed-soft',
    missing: 'bg-missing-soft text-missing border-missing-soft',
    pending: 'bg-pending-soft text-pending border-pending-soft',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-md border border-line bg-white px-3 text-sm placeholder:text-muted/70',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-relaxed placeholder:text-muted/70',
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: ReactNode;
  children?: ReactNode;
}) {
  const map = {
    info: { cls: 'border-brand-soft bg-brand-soft/60 text-ink', Icon: Info },
    warning: { cls: 'border-pending-soft bg-pending-soft text-ink', Icon: AlertTriangle },
    error: { cls: 'border-missing-soft bg-missing-soft text-ink', Icon: XCircle },
    success: { cls: 'border-demonstrated-soft bg-demonstrated-soft text-ink', Icon: CheckCircle2 },
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3 text-sm', map.cls)}
    >
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Accessible confirmation dialog built on the native <dialog> element. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={onCancel}
      className="m-auto w-full max-w-md rounded-xl border border-line p-0 shadow-xl backdrop:bg-ink/40"
    >
      <div className="p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function ScoreDial({
  value,
  label,
  range,
}: {
  value: number | null;
  label: string;
  range?: { low: number; high: number } | null;
}) {
  const v = value ?? 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const color =
    value === null
      ? '#c7ccd6'
      : v >= 75
        ? 'var(--color-demonstrated)'
        : v >= 50
          ? 'var(--color-brand)'
          : 'var(--color-forge)';
  return (
    <div className="flex items-center gap-4">
      <svg
        width="84"
        height="84"
        viewBox="0 0 84 84"
        role="img"
        aria-label={`${label}: ${value === null ? 'not available' : `${value} out of 100`}`}
      >
        <circle cx="42" cy="42" r={r} fill="none" stroke="#edf0f5" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 42 42)"
        />
        <text x="42" y="47" textAnchor="middle" className="fill-ink text-lg font-semibold">
          {value === null ? '—' : value}
        </text>
      </svg>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {range && range.low !== range.high && (
          <p className="text-xs text-muted">
            Range {range.low}–{range.high} until questions are answered
          </p>
        )}
      </div>
    </div>
  );
}

export function StateBadge({ status, state }: { status: string; state: string | null }) {
  if (status === 'pending') return <Badge tone="pending">Pending clarification</Badge>;
  if (state === 'demonstrated') return <Badge tone="demonstrated">Demonstrated</Badge>;
  if (state === 'user_confirmed') return <Badge tone="confirmed">Confirmed by you</Badge>;
  return <Badge tone="missing">Missing</Badge>;
}
