'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, CalendarCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ConfirmableOrder } from '@/app/(dashboard)/reconciliation/revenue-confirm/actions';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}
function moneyCell(cents: number): string {
  return cents > 0 ? peso(cents) : '—';
}

export function RevenueConfirmHistory({ orders }: { orders: ConfirmableOrder[] }) {
  // Group the closed orders by service date — each date is one daily close.
  const groups = useMemo(() => {
    const m = new Map<string, ConfirmableOrder[]>();
    for (const o of orders) {
      const arr = m.get(o.service_date);
      if (arr) arr.push(o); else m.set(o.service_date, [o]);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, rows]) => {
        // Distinct GL voucher numbers for this day. Usually 1 (the batched
        // Revenue Confirm posts everything into one journal), but a retry
        // after a partial earlier confirm could leave a day with 2 batches.
        const batches = [...new Set(rows.map((r) => r.gl_batch_nbr).filter((x): x is string => !!x))];
        return {
          date,
          rows,
          total: rows.reduce((s, o) => s + o.total_cents, 0),
          cash: rows.reduce((s, o) => s + o.cash_cents, 0),
          paymaya: rows.reduce((s, o) => s + o.paymaya_cents, 0),
          ar: rows.reduce((s, o) => s + (o.isAR ? o.total_cents : 0), 0),
          tip: rows.reduce((s, o) => s + o.tip_cents, 0),
          batches,
        };
      });
  }, [orders]);

  // Open the most recent day by default.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.length ? [groups[0].date] : []));
  function toggle(date: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n; });
  }

  if (groups.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-10 text-center">
          <CalendarCheck className="size-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-semibold text-muted-foreground mt-3">No confirmed orders yet for this branch.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const isOpen = expanded.has(g.date);
        return (
          <Card key={g.date} className="p-0 overflow-hidden ring-1 ring-border">
            {/* Single Table with colgroup so the clickable summary row's
                amounts line up with the data column positions below. */}
            <Table className="table-fixed">
              <colgroup>
                <col className="w-56" />{/* Order No */}
                <col className="w-16" />{/* PAX */}
                <col className="w-24" />{/* Settle */}
                <col />{/* Billing (flex) */}
                <col className="w-28" />{/* Cash */}
                <col className="w-28" />{/* PAYMAYA */}
                <col className="w-28" />{/* AR */}
                <col className="w-28" />{/* Total */}
                <col className="w-24" />{/* Tip */}
              </colgroup>
              <TableBody>
                {/* Always-visible clickable summary row — amounts under their
                    proper columns. Shows the GL voucher number if posted. */}
                <TableRow
                  onClick={() => toggle(g.date)}
                  className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                >
                  <TableCell colSpan={4} className="font-bold">
                    <span className="inline-flex items-center gap-2">
                      {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      <span className="tabular">{g.date}</span>
                      <span className="text-xs font-medium text-muted-foreground">({g.rows.length} order{g.rows.length > 1 ? 's' : ''})</span>
                      {g.batches.length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary font-mono">
                          GL #{g.batches.join(', #')}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="font-bold tabular text-right bg-muted/40 border-l border-border">{moneyCell(g.cash)}</TableCell>
                  <TableCell className="font-bold tabular text-right bg-muted/40">{moneyCell(g.paymaya)}</TableCell>
                  <TableCell className="font-bold tabular text-right bg-muted/40">{moneyCell(g.ar)}</TableCell>
                  <TableCell className="font-extrabold tabular text-right bg-muted/40 border-r border-border">{peso(g.total)}</TableCell>
                  <TableCell className="font-bold tabular text-right bg-muted/40 border-r border-border pr-4">{moneyCell(g.tip)}</TableCell>
                </TableRow>
              </TableBody>
              {isOpen && (
                <>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="bg-transparent" />
                      <TableHead className="bg-transparent" />
                      <TableHead className="bg-transparent" />
                      <TableHead className="bg-transparent" />
                      <TableHead colSpan={4} className="text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 border-x border-border">
                        Sales
                      </TableHead>
                      <TableHead className="text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 border-r border-border">
                        Pass-through
                      </TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="font-bold">Order No</TableHead>
                      <TableHead className="font-bold text-center">PAX</TableHead>
                      <TableHead className="font-bold">Settle</TableHead>
                      <TableHead className="font-bold">Billing</TableHead>
                      <TableHead className="font-bold text-center bg-muted/30 border-l border-border">Cash</TableHead>
                      <TableHead className="font-bold text-center bg-muted/30">PAYMAYA</TableHead>
                      <TableHead className="font-bold text-center bg-muted/30">AR</TableHead>
                      <TableHead className="font-bold text-right bg-muted/30 border-r border-border">Total</TableHead>
                      <TableHead className="font-bold text-right bg-muted/30 border-r border-border pr-4">Tip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.rows.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono font-bold">
                          <Link href={`/sales-orders/${o.id}`} className="hover:text-primary">{o.order_no}</Link>
                        </TableCell>
                        <TableCell className="font-bold tabular text-center">{o.pax}</TableCell>
                        <TableCell><Badge variant={o.isAR ? 'secondary' : 'default'} className="font-bold">{o.isAR ? 'AR' : 'Paid'}</Badge></TableCell>
                        <TableCell className="font-medium text-muted-foreground">{o.billing_label ?? 'Self-pay'}</TableCell>
                        <TableCell className="font-medium tabular text-right text-muted-foreground bg-muted/20 border-l border-border">{moneyCell(o.cash_cents)}</TableCell>
                        <TableCell className="font-medium tabular text-right text-muted-foreground bg-muted/20">{moneyCell(o.paymaya_cents)}</TableCell>
                        <TableCell className="font-medium tabular text-right text-muted-foreground bg-muted/20">{moneyCell(o.isAR ? o.total_cents : 0)}</TableCell>
                        <TableCell className="font-bold tabular text-right bg-muted/20 border-r border-border">{peso(o.total_cents)}</TableCell>
                        <TableCell className="font-medium tabular text-right text-muted-foreground bg-muted/20 border-r border-border pr-4">{moneyCell(o.tip_cents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </>
              )}
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
