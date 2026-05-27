'use client';

import { useState } from 'react';
import { BedDouble, ChevronDown, ChevronRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface BedNow {
  id: string;
  name: string;
  free: boolean;
  occupant: string | null;
}

// "Beds open now" tile — mirrors TherapistsNowCard: click to expand the per-bed
// list (free vs who's on it). Live snapshot for "now".
export function BedsNowCard({ free, total, beds }: { free: number; total: number; beds: BedNow[] }) {
  const [open, setOpen] = useState(false);
  const canExpand = beds.length > 0;
  return (
    <Card className="min-w-[200px] flex-1 p-3 sm:max-w-[280px]">
      <button
        type="button"
        onClick={() => canExpand && setOpen((o) => !o)}
        className={cn('flex w-full items-center justify-between gap-3 text-left', canExpand && 'cursor-pointer')}
      >
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground leading-tight">Beds open now</div>
          <div className={cn('mt-0.5 text-2xl font-extrabold tabular', free === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-primary')}>
            {free}<span className="text-base font-semibold text-muted-foreground"> / {total}</span>
          </div>
        </div>
        {canExpand
          ? (open ? <ChevronDown className="size-5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-5 shrink-0 text-muted-foreground" />)
          : <BedDouble className="size-6 shrink-0 text-muted-foreground/50" />}
      </button>
      {open && canExpand && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {beds.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold truncate">{b.name}</span>
              {b.free ? (
                <Badge className="font-bold text-[10px] shrink-0">Free</Badge>
              ) : (
                <span className="text-muted-foreground truncate shrink-0 max-w-[60%] text-right">{b.occupant}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
