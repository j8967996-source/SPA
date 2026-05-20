'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { addToWaitlist, setWaitlistStatus, convertWaitlistToOrder } from '@/app/(dashboard)/waitlist/actions';

export function AddWaitlistForm({ branchId }: { branchId: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pax, setPax] = useState('1');
  const [pending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return toast.error('Name required');
    startTransition(async () => {
      const r = await addToWaitlist({ branch_id: branchId, customer_name: name, customer_phone: phone || null, pax: Number(pax) });
      if (r.ok) { setName(''); setPhone(''); setPax('1'); toast.success('Added to waitlist'); }
      else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">Customer name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in guest" className="w-48" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">Phone</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" className="w-36" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs font-semibold">PAX</Label>
        <Input type="number" min="1" max="20" value={pax} onChange={(e) => setPax(e.target.value)} className="w-20" />
      </div>
      <Button size="sm" onClick={add} disabled={pending}><UserPlus className="size-4" /> Add</Button>
    </div>
  );
}

export function WaitlistRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        size="sm"
        onClick={() => startTransition(async () => {
          const r = await convertWaitlistToOrder(id);
          if (r.ok && r.data) { toast.success('Seated — order opened'); router.push(`/sales-orders/${r.data.orderId}`); }
          else if (!r.ok) toast.error(r.error);
        })}
        disabled={pending}
      >
        Seat
      </Button>
      <Button size="sm" variant="ghost" onClick={() => startTransition(async () => {
        const r = await setWaitlistStatus(id, 'walked_away');
        if (r.ok) toast.success('Marked walked away'); else toast.error(r.error);
      })} disabled={pending}>
        Walked away
      </Button>
    </div>
  );
}
