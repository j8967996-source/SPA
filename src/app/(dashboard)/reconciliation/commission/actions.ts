'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/server';

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const createSchema = z.object({
  period_from: z.string().min(1),
  period_to: z.string().min(1),
});

// Eligible order_items: parent order paid/closed, within range, has a therapist,
// the service is commission-applicable, and not yet settled.
async function loadEligible(from: string, to: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('order_items')
    .select(`
      id, list_price_cents, therapist_id, commission_settlement_id, status,
      service:service_items!order_items_service_item_id_fkey ( commission_applicable ),
      order:orders!order_items_order_id_fkey ( status, service_date, branch_id ),
      therapist:employees!order_items_therapist_id_fkey (
        id, name, employee_code,
        commission_class:commission_classes ( commission_rate )
      )
    `)
    .is('commission_settlement_id', null)
    .not('therapist_id', 'is', null);
  if (error) throw new Error(error.message);

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return (data ?? [])
    .map((it) => {
      const ord = one(it.order);
      const svc = one(it.service);
      const th = one(it.therapist);
      const cc = th ? one(th.commission_class) : null;
      return { it, ord, svc, th, rate: cc?.commission_rate ?? 0 };
    })
    .filter((r) =>
      r.ord && ['paid', 'closed'].includes(r.ord.status) &&
      r.it.status !== 'cancelled' &&
      r.ord.service_date >= from && r.ord.service_date <= to &&
      r.svc?.commission_applicable && r.th,
    );
}

export async function createCommissionPeriod(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { period_from, period_to } = parsed.data;
  if (period_to < period_from) return { ok: false, error: 'End date must be on/after start date' };

  const eligible = await loadEligible(period_from, period_to);
  if (eligible.length === 0) return { ok: false, error: 'No eligible commission items in this range' };

  // group by therapist + service-location branch
  type Agg = { therapist_id: string; branch_id: string; sessions: number; gross: number; commission: number };
  const groups = new Map<string, Agg>();
  for (const r of eligible) {
    const branchId = r.ord!.branch_id;
    const key = `${r.th!.id}:${branchId}`;
    if (!groups.has(key)) groups.set(key, { therapist_id: r.th!.id, branch_id: branchId, sessions: 0, gross: 0, commission: 0 });
    const g = groups.get(key)!;
    g.sessions += 1;
    g.gross += r.it.list_price_cents;
    g.commission += Math.round(r.it.list_price_cents * r.rate);
  }

  const supabase = createServiceClient();
  const ymd = period_from.replace(/-/g, '').slice(0, 6);
  const prefix = `CP-${ymd}-`;
  const { data: last } = await supabase
    .from('commission_periods').select('period_no').like('period_no', `${prefix}%`).order('period_no', { ascending: false }).limit(1);
  const seq = last?.[0]?.period_no ? Number(last[0].period_no.slice(prefix.length)) : 0;
  const period_no = `${prefix}${String(seq + 1).padStart(2, '0')}`;

  const totals = [...groups.values()].reduce(
    (acc, g) => ({ sessions: acc.sessions + g.sessions, gross: acc.gross + g.gross, commission: acc.commission + g.commission }),
    { sessions: 0, gross: 0, commission: 0 },
  );

  const { data: period, error: pe } = await supabase
    .from('commission_periods')
    .insert({
      period_no, period_from, period_to, status: 'draft',
      total_sessions: totals.sessions,
      total_gross_sales_cents: totals.gross,
      total_commission_cents: totals.commission,
    })
    .select('id')
    .single();
  if (pe || !period) return { ok: false, error: pe?.message ?? 'Could not create period' };

  const entries = [...groups.values()].map((g) => ({
    period_id: period.id,
    therapist_id: g.therapist_id,
    branch_id: g.branch_id,
    total_sessions: g.sessions,
    total_gross_sales_cents: g.gross,
    computed_commission_cents: g.commission,
    adjustment_cents: 0,
    final_amount_cents: g.commission,
  }));
  const { error: ee } = await supabase.from('commission_entries').insert(entries);
  if (ee) return { ok: false, error: ee.message };

  revalidatePath('/reconciliation/commission');
  return { ok: true, data: { id: period.id } };
}

export async function confirmCommissionPeriod(id: string): Promise<ActionResult> {
  const supabase = createServiceClient();
  const { data: period, error: pe } = await supabase
    .from('commission_periods').select('period_from, period_to, status').eq('id', id).single();
  if (pe || !period) return { ok: false, error: 'Period not found' };
  if (period.status !== 'draft') return { ok: false, error: 'Only draft periods can be confirmed' };

  // Re-resolve eligible items and stamp them with this period.
  const eligible = await loadEligible(period.period_from, period.period_to);
  const ids = eligible.map((r) => r.it.id);
  if (ids.length > 0) {
    const { error: ue } = await supabase
      .from('order_items')
      .update({ commission_settlement_id: id })
      .in('id', ids);
    if (ue) return { ok: false, error: ue.message };
  }

  const { error } = await supabase
    .from('commission_periods')
    .update({ status: 'closed', confirmed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/reconciliation/commission');
  return { ok: true };
}

export async function voidCommissionPeriod(id: string): Promise<ActionResult> {
  const supabase = createServiceClient();
  // release any stamped items first
  await supabase.from('order_items').update({ commission_settlement_id: null }).eq('commission_settlement_id', id);
  const { error } = await supabase.from('commission_periods').update({ status: 'void' }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/reconciliation/commission');
  return { ok: true };
}
