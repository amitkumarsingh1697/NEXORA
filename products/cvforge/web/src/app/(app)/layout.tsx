import { redirect } from 'next/navigation';
import { currentUser } from '@/server/http';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <AppShell user={{ email: user.email, displayName: user.displayName }}>{children}</AppShell>
  );
}
