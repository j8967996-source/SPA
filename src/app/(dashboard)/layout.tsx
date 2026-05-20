import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';
import { readSession } from '@/lib/session';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  if (!session) redirect('/login');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar userName={session.displayName ?? session.email} />
        <main className="flex-1 overflow-y-auto bg-background spa-pattern p-6">{children}</main>
      </div>
    </div>
  );
}
