'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import { setShift, clearShift } from '@/app/(dashboard)/shift-schedule/actions';

export interface StationAssignment {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  shiftType: string;
  shiftStart: string | null;
  shiftEnd: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  employee_code: string;
}

interface Props {
  branchId: string;
  date: string;
  station: { id: string; name: string };
  assignments: StationAssignment[];
  employees: EmployeeOption[];
}

const TYPES = [
  { value: 'regular', label: 'Regular' },
  { value: 'cross_branch', label: 'Cross-branch' },
  { value: 'on_call', label: 'On-call' },
];

function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

const TYPE_STYLE: Record<string, string> = {
  regular: 'bg-primary/15 text-primary',
  cross_branch: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  on_call: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
};

export function StationShiftCell({ branchId, date, station, assignments, employees }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [editing, setEditing] = useState<StationAssignment | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState('regular');
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('20:00');

  function openAdd() {
    setEditing(null);
    setEmployeeId(employees[0]?.id ?? '');
    setType('regular');
    setStart('10:00');
    setEnd('20:00');
    setOpen(true);
  }

  function openEdit(a: StationAssignment) {
    setEditing(a);
    setEmployeeId(a.employeeId);
    setType(TYPES.some((t) => t.value === a.shiftType) ? a.shiftType : 'regular');
    setStart(hhmm(a.shiftStart) || '10:00');
    setEnd(hhmm(a.shiftEnd) || '20:00');
    setOpen(true);
  }

  function save() {
    if (!employeeId) { toast.error('Pick a therapist'); return; }
    startTransition(async () => {
      const r = await setShift({
        employee_id: employeeId,
        branch_id: branchId,
        shift_date: date,
        shift_type: type,
        shift_start: start,
        shift_end: end,
        resource_id: station.id,
      });
      if (r.ok) { toast.success('Assigned'); setOpen(false); }
      else toast.error(r.error);
    });
  }

  // Keep the shift but free the bed (therapist becomes floating).
  function unassignBed() {
    if (!editing) return;
    startTransition(async () => {
      const r = await setShift({
        employee_id: editing.employeeId,
        branch_id: branchId,
        shift_date: date,
        shift_type: type,
        shift_start: start,
        shift_end: end,
        resource_id: null,
      });
      if (r.ok) { toast.success('Removed from station'); setOpen(false); }
      else toast.error(r.error);
    });
  }

  function removeShift() {
    if (!editing) return;
    startTransition(async () => {
      const r = await clearShift(editing.employeeId, branchId, date);
      if (r.ok) { toast.success('Shift cleared'); setOpen(false); }
      else toast.error(r.error);
    });
  }

  const employeeOptions = employees.map((e) => ({ value: e.id, label: `${e.name} · ${e.employee_code}` }));

  return (
    <>
      <div className="flex flex-col gap-1">
        {assignments.map((a) => (
          <button
            key={a.employeeId}
            type="button"
            onClick={() => openEdit(a)}
            className={`w-full rounded-md px-2 py-1 text-left text-xs font-bold transition-opacity hover:opacity-80 ${TYPE_STYLE[a.shiftType] ?? 'bg-muted'}`}
          >
            <span className="block truncate">{a.employeeName}</span>
            <span className="block text-[10px] font-semibold opacity-80 tabular">
              {hhmm(a.shiftStart)}–{hhmm(a.shiftEnd)}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={openAdd}
          disabled={employees.length === 0}
          className="w-full rounded-md px-2 py-1 text-xs font-bold text-muted-foreground/40 hover:bg-accent disabled:opacity-30"
        >
          <Plus className="size-3 inline" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold">
              {editing ? `Edit · ${editing.employeeName}` : `Assign to ${station.name}`}
            </DialogTitle>
            <DialogDescription className="font-medium tabular">{station.name} · {date}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Therapist</Label>
              <Select
                items={employeeOptions}
                value={employeeId}
                onValueChange={(v) => v && setEmployeeId(v)}
                disabled={!!editing}
              >
                <SelectTrigger><SelectValue placeholder="Pick a therapist" /></SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Type</Label>
              <Select items={TYPES} value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="st-start" className="font-semibold">Start</Label>
                <Input id="st-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="st-end" className="font-semibold">End</Label>
                <Input id="st-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            {editing && (
              <Button type="button" variant="ghost" className="text-destructive mr-auto" onClick={removeShift} disabled={pending}>
                Remove shift
              </Button>
            )}
            {editing && (
              <Button type="button" variant="outline" onClick={unassignBed} disabled={pending}>
                Free bed
              </Button>
            )}
            <Button type="button" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
