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

import { createBranch, updateBranch } from '@/app/(dashboard)/settings/branches/actions';

interface BranchFormDialogProps {
  mode?: 'create' | 'edit';
  branch?: { id: string; code: string; name: string; business_unit_id: string | null };
  businessUnits: { id: string; code: string; name: string }[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function BranchFormDialog({
  mode = 'create',
  branch,
  businessUnits,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: BranchFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [code, setCode] = useState(branch?.code ?? '');
  const [name, setName] = useState(branch?.name ?? '');
  const [businessUnitId, setBusinessUnitId] = useState(
    branch?.business_unit_id ?? businessUnits[0]?.id ?? '',
  );
  const [pending, startTransition] = useTransition();

  const businessUnitOptions = businessUnits.map((b) => ({
    value: b.id,
    label: `${b.code} — ${b.name}`,
  }));

  const isEdit = mode === 'edit';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessUnitId) {
      toast.error('Pick a business unit');
      return;
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateBranch({ id: branch!.id, name, business_unit_id: businessUnitId })
        : await createBranch({ code, name, business_unit_id: businessUnitId });
      if (result.ok) {
        toast.success(isEdit ? 'Branch updated' : 'Branch created');
        setOpen(false);
        if (!isEdit) {
          setCode('');
          setName('');
        }
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : null}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-bold">
              {isEdit ? `Edit Branch: ${branch?.code}` : 'New Branch'}
            </DialogTitle>
            <DialogDescription className="font-medium">
              {isEdit
                ? 'Branch code is immutable. Other fields can be updated.'
                : 'Create a new branch / location.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="branch-code" className="font-semibold">
                Code *
              </Label>
              <Input
                id="branch-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="OSP1"
                disabled={isEdit}
                required
                pattern="[A-Z0-9_-]+"
                maxLength={20}
              />
              <p className="text-xs font-medium text-muted-foreground">
                Uppercase letters, digits, - and _ only. Cannot be changed later.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="branch-name" className="font-semibold">
                Display Name *
              </Label>
              <Input
                id="branch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Oriental SPA 1"
                required
                maxLength={120}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Business Unit *</Label>
              <Select
                items={businessUnitOptions}
                value={businessUnitId}
                onValueChange={(v) => v && setBusinessUnitId(v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {businessUnitOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs font-medium text-muted-foreground">
                Which business line this branch belongs to. Used to scope staff visibility.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
