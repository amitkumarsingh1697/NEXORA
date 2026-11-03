'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  Download,
  FileText,
  LayoutDashboard,
  LogOut,
  Puzzle,
  Settings,
  Shield,
} from 'lucide-react';
import { Logo } from './brand';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/workspaces', label: 'Job workspaces', icon: Briefcase },
  { href: '/exports', label: 'Export center', icon: Download },
  { href: '/settings/extension', label: 'Browser extension', icon: Puzzle },
  { href: '/settings', label: 'Settings', icon: Settings, exact: true },
  { href: '/settings/privacy', label: 'Privacy & data', icon: Shield },
];

export function AppShell({
  user,
  children,
}: {
  user: { email: string; displayName: string };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <aside className="border-b border-line bg-white md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-4 md:block">
          <Logo href="/dashboard" />
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
          {nav.map((n) => {
            const active = n.exact
              ? path === n.href
              : path === n.href || path.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm',
                  active
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-muted hover:bg-canvas hover:text-ink',
                )}
              >
                <n.icon className="h-4 w-4" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t border-line p-4 text-xs md:absolute md:bottom-0 md:block md:w-full">
          <p className="truncate font-medium">{user.displayName || user.email}</p>
          <p className="truncate text-muted">{user.email}</p>
          <button
            className="mt-2 flex items-center gap-1 text-muted hover:text-ink"
            onClick={async () => {
              await api('/api/auth/logout', { method: 'POST' });
              router.push('/login');
              router.refresh();
            }}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
