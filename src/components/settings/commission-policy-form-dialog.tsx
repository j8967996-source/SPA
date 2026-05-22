'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';

import { createCommissionPolicy, updateCommissionPolicy } from '@/app/(dashboard)/settings/commission-policies/actions';

export interface PolicyBand { up_to_minutes: number | null; rate_multiplier: number }
export interface CommissionPolicyItem {
  id: string;
  code: string;
  name: string;
  warmup_enabled: boolean;
  warmup_occurrence: number;
  bands: PolicyBand[];
}

interface Props {
  mode?: 'create' | 'edit';
  item?: CommissionPolicyItem;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface BandInput { up: string; pct: string }

export function CommissionPolicyFormDialog({ mode = 'create', item, trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const isEdit = mode === 'edit';
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState(item?.code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [warmupEnabled, setWarmupEnabled] = useState(item?.warmup_enabled ?? true);
  const [occurrence, setOccurrence] = useState(String(item?.warmup_occurrence ?? 1));
  const [bands, setBands] = useState<BandInput[]>(
    (item?.bands ?? [{ up_to_minutes: 90, rate_multiplier: 0 }, { up_to_minutes: null, rate_multiplier: 0.5 }]).map((b) => ({
      up: b.up_to_minutes == null ? '' : String(b.up_to_minutes),
      pct: String(Math.round(b.rate_multiplier * 100)),
    })),
  );

  function setBand(i: number, key: keyof BandInput, v: string) {
    setBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, [key]: v } : b)));
  }
  function addBand() { setBands((prev) => [...prev, { up: '', pct: '100' }]); }
  function removeBand(i: number) { setBands((prev) => prev.filter((_, idx) => idx !== i)); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bandPayload = bands.map((b) => ({
      up_to_minutes: b.up.trim() === '' ? null : Number(b.up),
      rate_multiplier: Math.max(0, Math.min(1, (Number(b.pct) || 0) / 100)),
    }));
    const payload = { code, name, warmup_enabled: warmupEnabled, warmup_occurrence: Number(occurrence) || 1, bands: bandPayload };
    startTransition(async () => {
      const r = isEdit ? await updateCommissionPolicy({ id: item!.id, ...payload }) : await createCommissionPolicy(payload);
      if (r.ok) {
        toast.success(isEdit ? 'Policy updated' : 'Policy created');
        setOpen(false);
        if (!isEdit) { setCode(''); setName(''); }
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-bold">{isEdit ? `Edit Policy: ${item?.code}` : 'New Commission Policy'}</DialogTitle>
            <DialogDescription className="font-medium">
              First-session warm-up rule. commission = gross × class% × this multiplier.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="cpo-code" className="font-semibold">Code *</Label>
                <Input id="cpo-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="DEFAULT" disabled={isEdit} required maxLength={40} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cpo-name" className="font-semibold">Name *</Label>
                <Input id="cpo-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex flex-col gap-0.5">
                <Label className="font-semibold">Warm-up rule</Label>
                <p className="text-xs font-medium text-muted-foreground">
                  On = the day&apos;s first session gets a reduced rate. Off = every session pays full class rate.
                </p>
              </div>
              <Switch checked={warmupEnabled} onCheckedChange={setWarmupEnabled} />
            </div>

            {warmupEnabled && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cpo-occ" className="font-semibold">Applies to session #</Label>
                  <Input id="cpo-occ" type="number" min="1" max="20" value={occurrence} onChange={(e) => setOccurrence(e.target.value)} className="w-24" />
                  <p className="text-xs font-medium text-muted-foreground">Usually 1 (the day&apos;s first commissionable session).</p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="font-semibold">Duration bands</Label>
                  <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">
                      <span>Up to (min)</span><span>Of class rate (%)</span><span />
                    </div>
                    {bands.map((b, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <Input type="number" min="1" value={b.up} onChange={(e) => setBand(i, 'up', e.target.value)} placeholder="no limit" />
                        <Input type="number" min="0" max="100" value={b.pct} onChange={(e) => setBand(i, 'pct', e.target.value)} placeholder="0–100" />
                        <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeBand(i)}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={addBand} className="self-start"><Plus className="size-3.5" /> Add band</Button>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    First match by ascending minutes. Leave &ldquo;Up to&rdquo; blank = catch-all (longest). e.g. ≤90 → 0%, blank → 50%.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
