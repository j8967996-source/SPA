'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settleSOA, voidSOA, recordSoaPayment } from '@/app/(dashboard)/reconciliation/soa/actions';

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Third-party: record a (possibly partial) payment against the statement.
function RecordPaymentDialog({ id, outstandingCents }: { id: string; outstandingCents: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(outstandingCents / 100));
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayISO());
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const r = await recordSoaPayment({ soa_id: id, amount: Number(amount), payment_method: method || null, reference_no: reference || null, paid_at: date });
      if (r.ok) { toast.success('Payment recorded'); setOpen(false); }
      else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Record Payment</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bold">Record Payment</DialogTitle>
          <DialogDescription className="font-medium">
            Outstanding: ₱{(outstandingCents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Amount (₱)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Date received</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Method</Label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Bank transfer / Cheque" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / cheque no." />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || !amount}>{pending ? 'Saving…' : 'Record'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SoaActions({
  id,
  status,
  settlementType,
  outstandingCents,
  collect = true,
  allowVoid = true,
}: {
  id: string;
  status: string;
  settlementType: string | null;
  outstandingCents: number;
  collect?: boolean; // show Settle / Record Payment (collection lives in AR Balance)
  allowVoid?: boolean; // show Void (statement management lives in SOA History)
}) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok); else toast.error(r.error ?? 'Failed');
    });

  // settled / void are terminal — no actions.
  if (status === 'settled' || status === 'void') return null;
  if (!collect && !allowVoid) return null;

  return (
    <div className="flex items-center gap-2">
      {collect && (settlementType === 'intercompany' ? (
        // Intercompany: one-click settle = transfer to cost (no cash).
        <Button size="sm" onClick={() => run(() => settleSOA(id), 'SOA settled')} disabled={pending}>Settle</Button>
      ) : (
        // Third-party: collect money via recorded payments.
        <RecordPaymentDialog id={id} outstandingCents={outstandingCents} />
      ))}
      {allowVoid && (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => voidSOA(id), 'SOA voided')} disabled={pending}>Void</Button>
      )}
    </div>
  );
}
