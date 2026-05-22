import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';

import { createServiceClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CommissionPeriodDialog } from '@/components/reconciliation/commission-period-dialog';
import { CommissionPeriodExplorer, type CommissionPeriodView } from '@/components/reconciliation/commission-period-explorer';

export const dynamic = 'force-dynamic';

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface ItemRow {
  list_price_cents: number;
  status: string;
  commission_settlement_id: string | null;
  service_name: string;
  commission_applicable: boolean;
  order_no: string;
  service_date: string;
  order_status: string;
  branch_id: string;
  therapist: string;
  rate: number;
}

async function fetchData(branchId: string) {
  const supabase = createServiceClient();
  const [perRes, itemRes] = await Promise.all([
    supabase
      .from('commission_periods')
      .select(`
        id, period_no, period_from, period_to, status, total_commission_cents,
        commission_entries (
          total_sessions, total_gross_sales_cents, final_amount_cents,
          therapist:employees ( employee_code, name )
        )
      `)
      .eq('branch_id', branchId)
      .order('period_from', { ascending: false }),
    supabase
      .from('order_items')
      .select(`
        list_price_cents, status, commission_settlement_id,
        service:service_items!order_items_service_item_id_fkey ( name, commission_applicable ),
        order:orders!order_items_order_id_fkey ( order_no, service_date, status, branch_id ),
        therapist:employees!order_items_therapist_id_fkey ( name, commission_class:commission_classes ( commission_rate ) )
      `)
      .not('therapist_id', 'is', null),
  ]);

  const items: ItemRow[] = (itemRes.data ?? []).map((it) => {
    const ord = one(it.order);
    const svc = one(it.service);
    const th = one(it.therapist);
    const cc = th ? one(th.commission_class) : null;
    return {
      list_price_cents: it.list_price_cents,
      status: it.status,
      commission_settlement_id: it.commission_settlement_id,
      service_name: svc?.name ?? 'Service',
      commission_applicable: svc?.commission_applicable ?? false,
      order_no: ord?.order_no ?? '—',
      service_date: ord?.service_date ?? '',
      order_status: ord?.status ?? '',
      branch_id: ord?.branch_id ?? '',
      therapist: th?.name ?? '—',
      rate: cc?.commission_rate ?? 0,
    };
  }).filter((it) => it.branch_id === branchId);

  return { periods: perRes.data ?? [], items };
}

function buildView(
  p: { id: string; period_no: string; period_from: string; period_to: string; status: string; total_commission_cents: number | null; commission_entries: { total_sessions: number | null; total_gross_sales_cents: number | null; final_amount_cents: number | null; therapist: { employee_code: string; name: string } | { employee_code: string; name: string }[] | null }[] | null },
  items: ItemRow[],
): CommissionPeriodView {
  const groups = (p.commission_entries ?? []).map((e) => {
    const th = one(e.therapist);
    return {
      therapist: th ? `${th.employee_code} — ${th.name}` : '—',
      sessions: e.total_sessions ?? 0,
      gross: e.total_gross_sales_cents ?? 0,
      commission: e.final_amount_cents ?? 0,
    };
  }).sort((a, b) => b.commission - a.commission);

  const lineItems = p.status === 'closed'
    ? items.filter((it) => it.commission_settlement_id === p.id)
    : p.status === 'draft'
      ? items.filter((it) =>
          it.commission_settlement_id == null && it.status !== 'cancelled' &&
          ['paid', 'closed'].includes(it.order_status) && it.commission_applicable &&
          it.service_date >= p.period_from && it.service_date <= p.period_to)
      : [];

  return {
    id: p.id, period_no: p.period_no, period_from: p.period_from, period_to: p.period_to,
    status: p.status, total_cents: p.total_commission_cents ?? 0,
    groups,
    detail: lineItems
      .slice()
      .sort((a, b) => (a.service_date < b.service_date ? 1 : -1))
      .map((it) => ({
        date: it.service_date, orderNo: it.order_no, therapist: it.therapist, service: it.service_name,
        gross: it.list_price_cents, commission: Math.round(it.list_price_cents * it.rate),
      })),
  };
}

export default async function CommissionSettlementPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const supabase = createServiceClient();
  const { data: branches } = await supabase.from('branches').select('id, code, name').eq('active', true).order('code');
  const list = branches ?? [];
  const branchId = sp.branch && list.some((b) => b.id === sp.branch) ? sp.branch : list[0]?.id;

  const { periods, items } = branchId ? await fetchData(branchId) : { periods: [], items: [] as ItemRow[] };
  const views = periods.map((p) => buildView(p, items));

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3" /> Reconciliation
          </Link>
          <h2 className="text-3xl font-bold tracking-tight mt-1">Commission Settlement</h2>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            Semi-monthly periods · per branch · Excel for HR, not posted to ERP
          </p>
        </div>
        {branchId && (
          <CommissionPeriodDialog
            branches={list}
            defaultBranchId={branchId}
            trigger={<Button><Plus className="size-4" /> New Period</Button>}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {list.map((b) => (
          <Link
            key={b.id}
            href={`/reconciliation/commission?branch=${b.id}`}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-bold transition-colors', b.id === branchId ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent')}
          >
            {b.code}
          </Link>
        ))}
      </div>

      {!branchId ? (
        <Card className="border-dashed bg-muted/30 p-8 text-center text-sm font-semibold text-muted-foreground">Create a branch first.</Card>
      ) : (
        <CommissionPeriodExplorer periods={views} />
      )}
    </div>
  );
}
