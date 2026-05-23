'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { convertReservationToOrder } from '@/app/(dashboard)/reservations/actions';

// A reservation block on the Shift Schedule. Clicking it opens a confirm, then
// converts the reservation to a draft Sales Order and jumps to it.
export function ReservationConvertButton({
  reservationId,
  guest,
  className,
  style,
  title,
  children,
}: {
  reservationId: string;
  guest: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function convert() {
    start(async () => {
      const r = await convertReservationToOrder(reservationId);
      if (r.ok && r.data) {
        toast.success('Order created from reservation');
        router.push(`/sales-orders/${r.data.orderId}`);
      } else if (!r.ok) {
        toast.error(r.error);
      }
    });
  }

  return (
    <>
      <button type="button" className={className} style={style} title={title} onClick={() => setOpen(true)}>
        {children}
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert reservation to an order?</AlertDialogTitle>
            <AlertDialogDescription>
              {guest} — this creates a draft Sales Order (with the guest) and marks the reservation converted. You can add services on the order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={convert} disabled={pending}>
              {pending ? 'Converting…' : 'Convert & open'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
