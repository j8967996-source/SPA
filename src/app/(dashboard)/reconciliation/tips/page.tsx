import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';

import { createServiceClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TipSettlementDialog } from '@/components/reconciliation/tip-settlement-dialog';
import { TipSettlementExplorer, type SettlementView } from '@/components/reconciliation/tip-settlement-explorer';

export const dynamic = 'force-dynamic';

function peso(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface TipRow { amount_cents: number; therapist: string; settlement_id: string | null; status: string; service_date: string; order_no: string; branch_id: string }

async function fetchData(branchId: string) {
  const supabase = createServiceClient();
  const [setRes, tipRes] = await Promise.all([
    supabase.from('tip_settlements')
      .select('id, settlement_no, period_from, period_to, status, subtotal_cents')
      .eq('branch_id', branchId)
      .order('period_from', { ascending: false }),
    supabase
      .from('tips')
      .select('amount_cents, settlement_id, status, therapist:employees!tips_therapist_id_fkey ( name ), order:orders!tips_order_id_fkey ( service_date, order_no, branch_id )'),
  ]);
  const tips: TipRow[] = (tipRes.data ?? []).map((t) => {
    const ord = one(t.order);
    return {
      amount_cents: t.amount_cents,
      therapist: one(t.therapist)?.name ?? '—',
      settlement_id: t.settlement_id,
      status: t.status,
      service_date: ord?.service_date ?? '',
      order_no: ord?.order_no ?? '—',
      branch_id: ord?.branch_id ?? '',
    };
  }).filter((t) => t.branch_id === branchId);
  return { settlements: setRes.data ?? [], tips };
}

function buildView(s: { id: string; settlement_no: string; period_from: string; period_to: string; status: string; subtotal_cents: number }, tips: TipRow[]): SettlementView {
  const rows = s.status === 'closed' || s.status === 'void'
    ? tips.filter((t) => t.settlement_id === s.id)
    : tips.filter((t) => t.settlement_id == null && t.status === 'open' && t.service_date >= s.period_from && t.service_date <= s.period_to);
  const gm = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const g = gm.get(r.therapist) ?? { count: 0, total: 0 };
    g.count += 1; g.total += r.amount_cents;
    gm.set(r.therapist, g);
  }
  return {
    id: s.id, settlement_no: s.settlement_no, period_from: s.period_from, period_to: s.period_to,
    status: s.status, subtotal_cents: s.subtotal_cents,
    groups: [...gm.entries()].map(([therapist, g]) => ({ therapist, ...g })).sort((a, b) => b.total - a.total),
    detail: rows
      .slice()
      .sort((a, b) => (a.service_date < b.service_date ? 1 : -1))
      .map((r) => ({ date: r.service_date, orderNo: r.order_no, therapist: r.therapist, amount: r.amount_cents })),
  };
}

export default async function TipSettlementPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const sp = await searchParams;
  const supabase = createServiceClient();
  const { data: branches } = await supabase.from('branches').select('id, code, name').eq('active', true).order('code');
  const list = branches ?? [];
  const branchId = sp.branch && list.some((b) => b.id === sp.branch) ? sp.branch : list[0]?.id;

  const { settlements, tips } = branchId ? await fetchData(branchId) : { settlements: [], tips: [] as TipRow[] };
  const openTips = tips.filter((t) => t.settlement_id == null && t.status === 'open');
  const openTotal = openTips.reduce((s, t) => s + t.amount_cents, 0);
  const views = settlements.map((s) => buildView(s, tips));

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3" /> Reconciliation
          </Link>
          <h2 className="text-3xl font-bold tracking-tight mt-1">Tip Settlement</h2>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            PAYMAYA tips → settled to AP semi-monthly · per branch · {openTips.length} open · {peso(openTotal)}
          </p>
        </div>
        {branchId && (
          <TipSettlementDialog
            branches={list}
            defaultBranchId={branchId}
            trigger={<Button><Plus className="size-4" /> New Settlement</Button>}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {list.map((b) => (
          <Link
            key={b.id}
            href={`/reconciliation/tips?branch=${b.id}`}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-bold transition-colors', b.id === branchId ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-accent')}
          >
            {b.code}
          </Link>
        ))}
      </div>

      {!branchId ? (
        <Card className="border-dashed bg-muted/30 p-8 text-center text-sm font-semibold text-muted-foreground">Create a branch first.</Card>
      ) : (
        <TipSettlementExplorer settlements={views} />
      )}
    </div>
  );
}
