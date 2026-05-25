import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { currentSession, isAdmin } from '@/lib/auth';
import { AuditLogExplorer } from '@/components/settings/audit-log-explorer';
import { loadAuditLog } from '@/app/(dashboard)/settings/audit-log/actions';
import { AUDITED_TABLES } from '@/lib/audit-tables';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  // Audit data is sensitive — admins only.
  const session = await currentSession();
  if (!isAdmin(session)) redirect('/dashboard');

  const initialRows = await loadAuditLog({});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3" />
          Settings
        </Link>
        <h2 className="text-3xl font-bold tracking-tight mt-1">Audit Log</h2>
        <p className="text-sm font-semibold text-muted-foreground mt-1">
          Every create / update / delete on the important tables — who, when, and what changed. Newest first (latest {200}).
        </p>
      </div>

      <AuditLogExplorer initialRows={initialRows} tables={AUDITED_TABLES} />
    </div>
  );
}
