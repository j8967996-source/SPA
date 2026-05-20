'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  confirmCommissionPeriod,
  voidCommissionPeriod,
} from '@/app/(dashboard)/reconciliation/commission/actions';

export function CommissionPeriodActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  if (status !== 'draft') return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => startTransition(async () => {
          const r = await confirmCommissionPeriod(id);
          if (r.ok) toast.success('Period confirmed'); else toast.error(r.error);
        })}
        disabled={pending}
      >
        Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => startTransition(async () => {
          const r = await voidCommissionPeriod(id);
          if (r.ok) toast.success('Period voided'); else toast.error(r.error);
        })}
        disabled={pending}
      >
        Void
      </Button>
    </div>
  );
}
