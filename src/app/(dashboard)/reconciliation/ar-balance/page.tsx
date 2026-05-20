import Link from 'next/link';
import { ChevronLeft, Banknote } from 'lucide-react';

import { createServiceClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function fetchData() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_no, service_date, total_cents, paid_cents, status,
      billing:billing_destinations!orders_billing_to_id_fkey ( id, code, name, settlement_type )
    `)
    .not('billing_to_id', 'is', null)
    .not('status', 'in', '("void")')
    .is('deleted_at', null)
    .order('service_date', { ascending: true });
  if (error) throw new Error(error.message);
  // Only rows with an outstanding balance.
  return (data ?? []).filter((o) => o.total_cents - o.paid_cents > 0);
}

interface Group {
  id: string;
  code: string;
  name: string;
  settlement_type: string;
  outstanding: number;
  orders: { order_no: string; service_date: string; due: number }[];
}

export default async function ArBalancePage() {
  const rows = await fetchData();

  const groups = new Map<string, Group>();
  let grandTotal = 0;
  for (const o of rows) {
    const b = one(o.billing);
    if (!b) continue;
    const due = o.total_cents - o.paid_cents;
    grandTotal += due;
    if (!groups.has(b.id)) {
      groups.set(b.id, { id: b.id, code: b.code, name: b.name, settlement_type: b.settlement_type, outstanding: 0, orders: [] });
    }
    const g = groups.get(b.id)!;
    g.outstanding += due;
    g.orders.push({ order_no: o.order_no, service_date: o.service_date, due });
  }
  const list = [...groups.values()].sort((a, b) => b.outstanding - a.outstanding);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3" /> Reconciliation
        </Link>
        <h2 className="text-3xl font-bold tracking-tight mt-1">AR Balance</h2>
        <p className="text-sm font-semibold text-muted-foreground mt-1">
          {list.length} billing destinations · Total outstanding {peso(grandTotal)}
        </p>
      </div>

      {list.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 text-center">
            <Banknote className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground mt-3">
              No outstanding AR. Orders billed to a destination with an unpaid balance show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        list.map((g) => (
          <Card key={g.id} className="p-0 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b border-border py-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span className="font-mono">{g.code}</span> {g.name}
                <Badge variant="secondary" className="font-bold capitalize">{g.settlement_type.replace('_', '-')}</Badge>
              </CardTitle>
              <span className="text-lg font-extrabold tabular">{peso(g.outstanding)}</span>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Order No</TableHead>
                  <TableHead className="w-40 font-bold">Service Date</TableHead>
                  <TableHead className="w-40 font-bold text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.orders.map((o) => (
                  <TableRow key={o.order_no}>
                    <TableCell className="font-mono font-bold">{o.order_no}</TableCell>
                    <TableCell className="font-medium tabular">{o.service_date}</TableCell>
                    <TableCell className="font-bold tabular text-right">{peso(o.due)}</TableCell>
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
