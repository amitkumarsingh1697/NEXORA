import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="CVForge home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm font-bold text-white">
        CV<span className="text-forge">F</span>
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">CVForge</span>
        <span className="block text-[10px] uppercase tracking-widest text-muted">
          Nexora Career
        </span>
      </span>
    </Link>
  );
}
