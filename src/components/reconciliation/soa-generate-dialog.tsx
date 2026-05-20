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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { generateSOA } from '@/app/(dashboard)/reconciliation/soa/actions';

interface BillingOption { id: string; code: string; name: string }

function monthDefault(): { from: string; to: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date()).split('-');
  const y = Number(p[0]); const m = Number(p[1]);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

export function SoaGenerateDialog({ billings, trigger }: { billings: BillingOption[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const def = monthDefault();
  const [billingId, setBillingId] = useState(billings[0]?.id ?? '');
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);

  const opts = billings.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await generateSOA({ billing_to_id: billingId, period_from: from, period_to: to });
      if (r.ok) { toast.success('Draft SOA generated'); setOpen(false); }
      else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={false} render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-bold">Generate SOA</DialogTitle>
            <DialogDescription className="font-medium">
              Statements gather a billing destination&apos;s closed AR orders for the period.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Billing destination *</Label>
              <Select items={opts} value={billingId} onValueChange={(v) => v && setBillingId(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="soa-from" className="font-semibold">From *</Label>
                <Input id="soa-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="soa-to" className="font-semibold">To *</Label>
                <Input id="soa-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || !billingId}>{pending ? 'Generating…' : 'Generate'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
