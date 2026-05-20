import Link from 'next/link';
import { ChevronLeft, Plus, Briefcase } from 'lucide-react';

import { createServiceClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
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
import { CommissionPeriodDialog } from '@/components/reconciliation/commission-period-dialog';
import { CommissionPeriodActions } from '@/components/reconciliation/commission-period-actions';

export const dynamic = 'force-dynamic';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', closed: 'default', void: 'destructive',
};

async function fetchData() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('commission_periods')
    .select(`
      id, period_no, period_from, period_to, status,
      total_sessions, total_gross_sales_cents, total_commission_cents,
      commission_entries (
        id, total_sessions, total_gross_sales_cents, computed_commission_cents, final_amount_cents,
        therapist:employees ( employee_code, name ),
        branch:branches ( code )
      )
    `)
    .order('period_from', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default async function CommissionSettlementPage() {
  const periods = await fetchData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3" /> Reconciliation
          </Link>
          <h2 className="text-3xl font-bold tracking-tight mt-1">Commission Settlement</h2>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            Semi-monthly periods · Excel for HR, not posted to ERP
          </p>
        </div>
        <CommissionPeriodDialog
          trigger={<Button><Plus className="size-4" /> New Period</Button>}
        />
      </div>

      {periods.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 text-center">
            <Briefcase className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground mt-3">
              No commission periods yet. Create one to aggregate paid-order commissions by therapist.
            </p>
          </CardContent>
        </Card>
      ) : (
        periods.map((p) => {
          const entries = (p.commission_entries ?? []).map((e) => ({
            id: e.id,
            therapist: one(e.therapist),
            branch: one(e.branch),
            sessions: e.total_sessions,
            gross: e.total_gross_sales_cents,
            computed: e.computed_commission_cents,
            final: e.final_amount_cents,
          }));
          return (
            <Card key={p.id} className="p-0 overflow-hidden">
              <CardHeader className="flex-row items-center justify-between border-b border-border py-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <span className="font-mono">{p.period_no}</span>
                  <span className="font-medium text-muted-foreground text-sm">{p.period_from} → {p.period_to}</span>
                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'} className="font-bold capitalize">{p.status}</Badge>
                </CardTitle>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold tabular">{peso(p.total_commission_cents ?? 0)}</span>
                  <CommissionPeriodActions id={p.id} status={p.status} />
                </div>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold">Therapist</TableHead>
                    <TableHead className="w-20 font-bold">Branch</TableHead>
                    <TableHead className="w-20 font-bold text-right">Sessions</TableHead>
                    <TableHead className="w-36 font-bold text-right">Gross</TableHead>
                    <TableHead className="w-36 font-bold text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm font-semibold text-muted-foreground">No entries</TableCell></TableRow>
                  ) : entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-semibold">
                        {e.therapist ? `${e.therapist.employee_code} — ${e.therapist.name}` : '—'}
                      </TableCell>
                      <TableCell className="font-mono font-bold">{e.branch?.code ?? '—'}</TableCell>
                      <TableCell className="font-bold tabular text-right">{e.sessions}</TableCell>
                      <TableCell className="font-medium tabular text-right">{peso(e.gross)}</TableCell>
                      <TableCell className="font-bold tabular text-right">{peso(e.final)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          );
        })
      )}
    </div>
  );
}
