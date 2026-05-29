'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createAuditedClient } from '@/lib/supabase/server';
import { currentSession, isManager } from '@/lib/auth';
import { canAccessBranch } from '@/lib/branch-access';

export type ActionResult = { ok: true } | { ok: false; error: string };

const issueSchema = z.object({
  customer_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  initial_amount: z.coerce.number().positive(),
  bonus_amount: z.coerce.number().min(0).default(0),
  discount_class_id: z.string().uuid().optional().nullable(),
  expires_at: z.string().min(1),
});

async function nextCardNo(): Promise<string> {
  const supabase = await createAuditedClient();
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).replace(/-/g, '');
  const prefix = `SVC-${ymd}-`;
  const { data } = await supabase
    .from('stored_value_cards')
    .select('card_no')
    .like('card_no', `${prefix}%`)
    .order('card_no', { ascending: false })
    .limit(1);
  const seq = data?.[0]?.card_no ? Number(data[0].card_no.slice(prefix.length)) : 0;
  return `${prefix}${String(seq + 1).padStart(3, '0')}`;
}

export async function issueCard(input: unknown): Promise<ActionResult> {
  if (!(await currentSession())) return { ok: false, error: 'Sign in required' };
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  if (!(await canAccessBranch(d.branch_id))) return { ok: false, error: 'No access to this branch' };
  const supabase = await createAuditedClient();
  const initialCents = Math.round(d.initial_amount * 100);
  const bonusCents = Math.round(d.bonus_amount * 100);
  const balance = initialCents + bonusCents;
  const card_no = await nextCardNo();
  const now = new Date().toISOString();

  const { data: card, error } = await supabase
    .from('stored_value_cards')
    .insert({
      card_no,
      customer_id: d.customer_id,
      branch_id: d.branch_id,
      initial_amount_cents: initialCents,
      bonus_amount_cents: bonusCents,
      current_balance_cents: balance,
      discount_class_id: d.discount_class_id || null,
      issued_at: now,
      expires_at: new Date(d.expires_at).toISOString(),
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !card) {
    if (error?.code === '23505') return { ok: false, error: `Card "${card_no}" already exists` };
    return { ok: false, error: error?.message ?? 'Insert failed' };
  }

  const txns: {
    card_id: string; type: string; amount_cents: number; balance_after_cents: number; branch_id: string;
  }[] = [
    { card_id: card.id, type: 'top_up', amount_cents: initialCents, balance_after_cents: initialCents, branch_id: d.branch_id },
  ];
  if (bonusCents > 0) {
    txns.push({ card_id: card.id, type: 'bonus_grant', amount_cents: bonusCents, balance_after_cents: balance, branch_id: d.branch_id });
  }
  await supabase.from('stored_value_transactions').insert(txns);

  revalidatePath('/stored-value-cards');
  return { ok: true };
}

const topUpSchema = z.object({
  card_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export async function topUpCard(input: unknown): Promise<ActionResult> {
  if (!(await currentSession())) return { ok: false, error: 'Sign in required' };
  const parsed = topUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  const supabase = await createAuditedClient();
  const addCents = Math.round(d.amount * 100);

  const { data: card, error: ce } = await supabase
    .from('stored_value_cards')
    .select('current_balance_cents, branch_id, status')
    .eq('id', d.card_id)
    .single();
  if (ce || !card) return { ok: false, error: 'Card not found' };
  if (card.branch_id && !(await canAccessBranch(card.branch_id))) return { ok: false, error: 'No access to this branch' };
  if (card.status !== 'active') return { ok: false, error: 'Card is not active' };

  const newBalance = card.current_balance_cents + addCents;
  const { error: ue } = await supabase
    .from('stored_value_cards')
    .update({ current_balance_cents: newBalance })
    .eq('id', d.card_id);
  if (ue) return { ok: false, error: ue.message };

  await supabase.from('stored_value_transactions').insert({
    card_id: d.card_id, type: 'top_up', amount_cents: addCents, balance_after_cents: newBalance, branch_id: card.branch_id,
  });

  revalidatePath('/stored-value-cards');
  return { ok: true };
}

export async function setCardStatus(
  id: string,
  status: 'active' | 'suspended',
): Promise<ActionResult> {
  // Freezing / unfreezing a card with a balance affects the holder's spend
  // ability — that's a state change, not a routine top-up. Manager-only.
  const session = await currentSession();
  if (!isManager(session)) return { ok: false, error: 'Manager permission required to change card status' };
  const supabase = await createAuditedClient();
  const { data: card } = await supabase
    .from('stored_value_cards')
    .select('current_balance_cents, branch_id')
    .eq('id', id)
    .single();
  if (card?.branch_id && !(await canAccessBranch(card.branch_id))) return { ok: false, error: 'No access to this branch' };
  const { error } = await supabase.from('stored_value_cards').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  if (card) {
    await supabase.from('stored_value_transactions').insert({
      card_id: id,
      type: status === 'suspended' ? 'freeze' : 'unfreeze',
      amount_cents: 0,
      balance_after_cents: card.current_balance_cents,
      branch_id: card.branch_id,
    });
  }
  revalidatePath('/stored-value-cards');
  return { ok: true };
}
