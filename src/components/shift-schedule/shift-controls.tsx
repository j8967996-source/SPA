'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  branches: { id: string; code: string; name: string }[];
  branchId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
}

function shiftWeek(weekStart: string, deltaDays: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function ShiftControls({ branches, branchId, weekStart }: Props) {
  const router = useRouter();
  const branchOptions = branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }));

  function go(branch: string, week: string) {
    router.push(`/shift-schedule?branch=${branch}&week=${week}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
