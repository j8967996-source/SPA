'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CommissionPeriodActions } from '@/components/reconciliation/commission-period-actions';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface CommissionGroupRow { therapist: string; sessions: number; gross: number; commission: number }
export interface CommissionDetailRow { date: string; orderNo: string; therapist: string; service: string; gross: number; commission: number }
export interface CommissionPeriodView {
  id: string;
  period_no: string;
  period_from: string;
  period_to: string;
  status: string;
  total_cents: number;
  groups: CommissionGroupRow[];
  detail: CommissionDetailRow[];
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', closed: 'default', void: 'destructive',
};
const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'closed', label: 'Closed' },
  { value: 'void', label: 'Void' },
];

export function CommissionPeriodExplorer({ periods }: { periods: CommissionPeriodView[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = periods.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (from && p.period_to < from) return false;
    if (to && p.period_from > to) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Date From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Date To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Status</Label>
            <Select items={STATUSES} value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {(from || to || status !== 'all') && (
            <button type="button" onClick={() => { setFrom(''); setTo(''); setStatus('all'); }} className="text-xs font-bold text-muted-foreground hover:text-foreground py-2">
              Clear
            </button>
          )}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-dashed bg-muted/30 p-8 text-center text-sm font-semibold text-muted-foreground">
          No periods match the filter.
        </Card>
      ) : (
        filtered.map((p) => (
          <Card key={p.id} className="p-0 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b border-border py-3">
              <CardTitle className="text-base font-bold flex items-center gap-2 flex-wrap">
                <span className="font-mono">{p.period_no}</span>
                <span className="font-medium text-muted-foreground text-sm">{p.period_from} → {p.period_to}</span>
                <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'} className="font-bold capitalize">{p.status}</Badge>
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold tabular">{peso(p.total_cents)}</span>
                <CommissionPeriodActions id={p.id} status={p.status} />
              </div>
            </CardHeader>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Therapist</TableHead>
                  <TableHead className="w-20 font-bold text-right">Sessions</TableHead>
                  <TableHead className="w-36 font-bold text-right">Gross</TableHead>
                  <TableHead className="w-36 font-bold text-right">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.groups.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-sm font-semibold text-muted-foreground">No entries</TableCell></TableRow>
                ) : p.groups.map((g) => (
                  <TableRow key={g.therapist}>
                    <TableCell className="font-semibold">{g.therapist}</TableCell>
                    <TableCell className="font-bold tabular text-right">{g.sessions}</TableCell>
                    <TableCell className="font-medium tabular text-right">{peso(g.gross)}</TableCell>
                    <TableCell className="font-bold tabular text-right">{peso(g.commission)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {p.detail.length > 0 && (
              <>
                <div className="px-4 py-1.5 border-y border-border bg-muted/30 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Line items</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28 font-bold">Date</TableHead>
                      <TableHead className="font-bold">Order No</TableHead>
                      <TableHead className="font-bold">Therapist</TableHead>
                      <TableHead className="font-bold">Service</TableHead>
                      <TableHead className="w-32 font-bold text-right">Gross</TableHead>
                      <TableHead className="w-32 font-bold text-right">Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.detail.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium tabular">{d.date}</TableCell>
                        <TableCell className="font-mono font-semibold text-sm">{d.orderNo}</TableCell>
                        <TableCell className="font-semibold">{d.therapist}</TableCell>
                        <TableCell className="font-medium text-muted-foreground">{d.service}</TableCell>
                        <TableCell className="font-medium tabular text-right">{peso(d.gross)}</TableCell>
                        <TableCell className="font-bold tabular text-right">{peso(d.commission)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
