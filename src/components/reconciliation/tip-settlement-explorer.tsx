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
import { TipSettlementActions } from '@/components/reconciliation/tip-settlement-actions';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export interface TipDetailRow { date: string; orderNo: string; therapist: string; amount: number }
export interface TipGroupRow { therapist: string; count: number; total: number }
export interface SettlementView {
  id: string;
  settlement_no: string;
  period_from: string;
  period_to: string;
  status: string;
  subtotal_cents: number;
  groups: TipGroupRow[];
  detail: TipDetailRow[];
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

export function TipSettlementExplorer({ settlements }: { settlements: SettlementView[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = settlements.filter((s) => {
    if (status !== 'all' && s.status !== status) return false;
    if (from && s.period_to < from) return false;
    if (to && s.period_from > to) return false;
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
          No settlements match the filter.
        </Card>
      ) : (
        filtered.map((s) => (
          <Card key={s.id} className="p-0 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b border-border py-3">
              <CardTitle className="text-base font-bold flex items-center gap-2 flex-wrap">
                <span className="font-mono">{s.settlement_no}</span>
                <span className="font-medium text-muted-foreground text-sm">{s.period_from} → {s.period_to}</span>
                <Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'} className="font-bold capitalize">{s.status}</Badge>
              </CardTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold tabular">{peso(s.subtotal_cents)}</span>
                <TipSettlementActions id={s.id} status={s.status} />
              </div>
            </CardHeader>

            {s.groups.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold">
                {s.groups.map((g) => (
                  <span key={g.therapist}>
                    {g.therapist} <span className="text-muted-foreground">×{g.count}</span> · <span className="tabular">{peso(g.total)}</span>
                  </span>
                ))}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28 font-bold">Date</TableHead>
                  <TableHead className="font-bold">Order No</TableHead>
                  <TableHead className="font-bold">Therapist</TableHead>
                  <TableHead className="w-32 font-bold text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.detail.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-sm font-semibold text-muted-foreground">No tips</TableCell></TableRow>
                ) : s.detail.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium tabular">{d.date}</TableCell>
                    <TableCell className="font-mono font-semibold text-sm">{d.orderNo}</TableCell>
                    <TableCell className="font-semibold">{d.therapist}</TableCell>
                    <TableCell className="font-bold tabular text-right">{peso(d.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))
      )}
    </div>
  );
}
