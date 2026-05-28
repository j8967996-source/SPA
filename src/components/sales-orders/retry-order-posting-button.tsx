'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { retryOrderRevenuePosting } from '@/app/(dashboard)/reconciliation/revenue-confirm/actions';

/** Manager-only Retry for the order's ERP posting (Revenue Confirm). Shown
 *  inside the red "ERP posting failed" banner on the order detail page; runs
 *  the same compose-and-post path as Revenue Confirm, refreshing the page so
 *  the new outcome (GL #batch or new error) is visible immediately. */
export function RetryOrderPostingButton({ orderId, canManage }: { orderId: string; canManage: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!canManage) return null;
  function retry() {
    start(async () => {
      const r = await retryOrderRevenuePosting(orderId);
      if (r.ok) { toast.success('Retried — posted to ERP'); router.refresh(); }
      else { toast.error(r.error); router.refresh(); }
    });
  }
  return (
    <Button size="sm" variant="outline" onClick={retry} disabled={pending} className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10">
      <RotateCcw className="size-3.5" /> {pending ? 'Retrying…' : 'Retry'}
    </Button>
  );
}
