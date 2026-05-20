'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Users, BedDouble } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ShiftView = 'employee' | 'station';

interface Props {
  branches: { id: string; code: string; name: string }[];
  branchId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  view: ShiftView;
}

function shiftWeek(weekStart: string, deltaDays: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function ShiftControls({ branches, branchId, weekStart, view }: Props) {
  const router = useRouter();
  const branchOptions = branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }));

  function go(branch: string, week: string, v: ShiftView = view) {
    router.push(`/shift-schedule?branch=${branch}&week=${week}&view=${v}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border p-0.5">
        <button
          type="button"
          onClick={() => go(branchId, weekStart, 'employee')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition-colors',
            view === 'employee' ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Users className="size-4" /> Therapist
        </button>
        <button
          type="button"
          onClick={() => go(branchId, weekStart, 'station')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition-colors',
            view === 'station' ? 'bg-sidebar-primary/15 text-sidebar-primary' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <BedDouble className="size-4" /> Station
        </button>
      </div>
      <Select items={branchOptions} value={branchId} onValueChange={(v) => v && go(v, weekStart)}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          {branchOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" onClick={() => go(branchId, shiftWeek(weekStart, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => go(branchId, shiftWeek(thisMonday(), 0))}>
          This week
        </Button>
        <Button size="icon" variant="outline" onClick={() => go(branchId, shiftWeek(weekStart, 7))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function thisMonday(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Monday
  now.setDate(now.getDate() - day);
  return now.toISOString().slice(0, 10);
}
