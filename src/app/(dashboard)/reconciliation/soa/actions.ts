'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/server';
import { currentSession, isManager } from '@/lib/auth';

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export interface SoaCandidate {
  id: string;
  order_no: string;
  service_date: string;
  total_cents: number;
}

/** Closed AR orders for a billing destination in range, not yet on any SOA. */
export async function loadSoaCandidates(billingToId: string, from: string, to: string): Promise<SoaCandidate[]> {
  const supabase = createServiceClient();
  const [{ data: orders }, { data: taken }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_no, service_date, total_cents, status')
      .eq('billing_to_id', billingToId)
      .eq('status', 'closed')
      .is('deleted_at', null)
      .gte('service_date', from)
      .lte('service_date', to),
    supabase.from('revenue_soa_orders').select('order_id'),
  ]);
  const takenIds = new Set((taken ?? []).map((t) => t.order_id));
  return (orders ?? [])
    .filter((o) => !takenIds.has(o.id))
    .map((o) => ({ id: o.id, order_no: o.order_no, service_date: o.service_date, total_cents: o.total_cents }));
}

const createSchema = z.object({
  billing_to_id: z.string().uuid(),
  period_from: z.string().min(1),
  period_to: z.string().min(1),
});

export async function generateSOA(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await currentSession();
  if (!isManager(session)) return { ok: false, error: 'Manager permission required' };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { billing_to_id, period_from, period_to } = parsed.data;
  if (period_to < period_from) return { ok: false, error: 'End date must be on/after start date' };

  const supabase = createServiceClient();
  const { data: billing } = await supabase
    .from('billing_destinations')
    .select('code, settlement_type, credit_terms_days')
    .eq('id', billing_to_id)
    .single();
  if (!billing) return { ok: false, error: 'Billing destination not found' };

  const candidates = await loadSoaCandidates(billing_to_id, period_from, period_to);
  if (candidates.length === 0) return { ok: false, error: 'No un-SOA’d closed orders for this billing/period' };
  const subtotal = candidates.reduce((s, c) => s + c.total_cents, 0);

  const ym = period_from.replace(/-/g, '').slice(0, 6);
  const prefix = `SOA-${ym}-${billing.code}-`;
  const { data: last } = await supabase
    .from('revenue_soa').select('soa_no').like('soa_no', `${prefix}%`).order('soa_no', { ascending: false }).limit(1);
  const seq = last?.[0]?.soa_no ? Number(last[0].soa_no.slice(prefix.length)) : 0;
  const soa_no = `${prefix}${String(seq + 1).padStart(3, '0')}`;

  const { data: soa, error } = await supabase
    .from('revenue_soa')
    .insert({
      soa_no, billing_to_id, period_from, period_to,
      settlement_type: billing.settlement_type,
      subtotal_cents: subtotal, total_cents: subtotal, paid_cents: 0, outstanding_cents: subtotal,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !soa) return { ok: false, error: error?.message ?? 'Could not create SOA' };

  const { error: le } = await supabase.from('revenue_soa_orders').insert(
    candidates.map((c) => ({ soa_id: soa.id, order_id: c.id, amount_cents: c.total_cents })),
  );
  if (le) return { ok: false, error: le.message };

  revalidatePath('/reconciliation/soa');
  return { ok: true, data: { id: soa.id } };
}

export async function issueSOA(id: string): Promise<ActionResult> {
  const session = await currentSession();
  if (!isManager(session)) return { ok: false, error: 'Manager permission required' };
  const supabase = createServiceClient();
  const { data: soa } = await supabase
    .from('revenue_soa')
    .select('status, period_to, settlement_type, billing:billing_destinations!revenue_soa_billing_to_id_fkey ( credit_terms_days )')
    .eq('id', id)
    .single();
  if (!soa) return { ok: false, error: 'SOA not found' };
  if (soa.status !== 'draft') return { ok: false, error: 'Only a draft SOA can be issued' };
  const today = new Date().toISOString().slice(0, 10);
  const creditDays = one(soa.billing)?.credit_terms_days ?? 0;
  const due = soa.settlement_type === 'third_party' && creditDays > 0
    ? new Date(Date.now() + creditDays * 86400000).toISOString().slice(0, 10)
    : null;
  const { error } = await supabase.from('revenue_soa').update({ status: 'issued', issued_date: today, due_date: due }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/reconciliation/soa');
  return { ok: true };
}

export async function settleSOA(id: string): Promise<ActionResult> {
  const session = await currentSession();
  if (!isManager(session)) return { ok: false, error: 'Manager permission required' };
  const supabase = createServiceClient();
  const { data: soa } = await supabase.from('revenue_soa').select('status, total_cents').eq('id', id).single();
  if (!soa) return { ok: false, error: 'SOA not found' };
  if (!['issued', 'partial_paid'].includes(soa.status)) return { ok: false, error: 'Only an issued SOA can be settled' };
  // NOTE: ERP settle posting deferred. Marks the statement fully settled.
  const { error } = await supabase
    .from('revenue_soa')
    .update({ status: 'settled', paid_cents: soa.total_cents, outstanding_cents: 0 })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/reconciliation/soa');
  return { ok: true };
}

export async function voidSOA(id: string): Promise<ActionResult> {
  const session = await currentSession();
  if (!isManager(session)) return { ok: false, error: 'Manager permission required' };
  const supabase = createServiceClient();
  // Release the orders so they can be re-stated.
  await supabase.from('revenue_soa_orders').delete().eq('soa_id', id);
  const { error } = await supabase.from('revenue_soa').update({ status: 'void' }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/reconciliation/soa');
  return { ok: true };
}
