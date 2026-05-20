'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { issueSOA, settleSOA, voidSOA } from '@/app/(dashboard)/reconciliation/soa/actions';

export function SoaActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok); else toast.error(r.error ?? 'Failed');
    });

  if (status === 'settled' || status === 'void') return null;

  return (
    <div className="flex items-center gap-2">
      {status === 'draft' && (
        <Button size="sm" onClick={() => run(() => issueSOA(id), 'SOA issued')} disabled={pending}>Issue</Button>
      )}
      {(status === 'issued' || status === 'partial_paid') && (
        <Button size="sm" onClick={() => run(() => settleSOA(id), 'SOA settled')} disabled={pending}>Settle</Button>
      )}
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => voidSOA(id), 'SOA voided')} disabled={pending}>Void</Button>
    </div>
  );
}
