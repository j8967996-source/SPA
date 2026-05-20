import Link from 'next/link';
import { ChevronLeft, Plus, FileText } from 'lucide-react';

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
import { Card, CardContent } from '@/components/ui/card';
import { SoaGenerateDialog } from '@/components/reconciliation/soa-generate-dialog';
import { SoaActions } from '@/components/reconciliation/soa-actions';

export const dynamic = 'force-dynamic';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', issued: 'default', partial_paid: 'secondary', settled: 'default', void: 'destructive',
};

async function fetchData() {
  const supabase = createServiceClient();
  const [soaRes, billRes, arMethod] = await Promise.all([
    supabase
      .from('revenue_soa')
      .select('id, soa_no, status, settlement_type, period_from, period_to, total_cents, outstanding_cents, billing:billing_destinations!revenue_soa_billing_to_id_fkey ( code, name )')
      .order('created_at', { ascending: false }),
    supabase.from('billing_destinations').select('id, code, name, settlement_type, default_payment_method_id').eq('active', true).order('code'),
    supabase.from('payment_methods').select('id').eq('code', 'ar').maybeSingle(),
  ]);
  // Only AR-type billings can have a SOA (default payment = AR).
  const arId = arMethod.data?.id ?? null;
  const billings = (billRes.data ?? []).filter((b) => arId && b.default_payment_method_id === arId).map((b) => ({ id: b.id, code: b.code, name: b.name }));
  return { soas: soaRes.data ?? [], billings };
}

export default async function RevenueSoaPage() {
  const { soas, billings } = await fetchData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3" /> Reconciliation
          </Link>
          <h2 className="text-3xl font-bold tracking-tight mt-1">Revenue SOA</h2>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            Statements of account for AR billing destinations · intercompany vs third-party
          </p>
        </div>
        <SoaGenerateDialog billings={billings} trigger={<Button disabled={billings.length === 0}><Plus className="size-4" /> Generate SOA</Button>} />
      </div>

      {soas.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 text-center">
            <FileText className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground mt-3">
              No statements yet. Generate one for an AR billing destination&apos;s closed orders.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold">SOA No</TableHead>
                <TableHead className="font-bold">Billing</TableHead>
                <TableHead className="w-28 font-bold">Type</TableHead>
                <TableHead className="font-bold">Period</TableHead>
                <TableHead className="w-32 font-bold text-right">Total</TableHead>
                <TableHead className="w-28 font-bold">Status</TableHead>
                <TableHead className="w-44" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {soas.map((s) => {
                const b = one(s.billing);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono font-bold">{s.soa_no}</TableCell>
                    <TableCell className="font-medium">{b ? `${b.code} — ${b.name}` : '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-bold capitalize">{(s.settlement_type ?? '').replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular text-muted-foreground">{s.period_from} → {s.period_to}</TableCell>
                    <TableCell className="font-bold tabular text-right">{peso(s.total_cents)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'} className="font-bold capitalize">{s.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell><div className="flex justify-end"><SoaActions id={s.id} status={s.status} /></div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
