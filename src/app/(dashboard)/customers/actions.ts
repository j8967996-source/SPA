'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createAuditedClient } from '@/lib/supabase/server';
import { currentSession } from '@/lib/auth';
import type { Database } from '@/types/database';

type CustomerUpdate = Database['public']['Tables']['customers']['Update'];

const schema = z.object({
  phone: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  gender: z.enum(['M', 'F', 'Other']).optional().nullable(),
  email: z.string().email().max(120).optional().nullable().or(z.literal('')),
  dob: z.string().optional().nullable().or(z.literal('')),
  customer_type: z.string().max(40).optional().nullable(),
  primary_business_unit_id: z.string().uuid().optional().nullable(),
});

const updateSchema = schema.partial({ phone: true }).extend({ id: z.string().uuid() });

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createCustomer(input: unknown): Promise<ActionResult> {
  if (!(await currentSession())) return { ok: false, error: 'Sign in required' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  const supabase = await createAuditedClient();
  const { error } = await supabase.from('customers').insert({
    phone: d.phone,
    name: d.name,
    gender: d.gender || null,
    email: d.email || null,
    dob: d.dob || null,
    customer_type: d.customer_type || null,
    primary_business_unit_id: d.primary_business_unit_id || null,
    status: 'active',
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: `Phone "${d.phone}" already exists` };
    return { ok: false, error: error.message };
  }
  revalidatePath('/customers');
  return { ok: true };
}

export async function updateCustomer(input: unknown): Promise<ActionResult> {
  if (!(await currentSession())) return { ok: false, error: 'Sign in required' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  const patch: CustomerUpdate = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.gender !== undefined) patch.gender = d.gender || null;
  if (d.email !== undefined) patch.email = d.email || null;
  if (d.dob !== undefined) patch.dob = d.dob || null;
  if (d.customer_type !== undefined) patch.customer_type = d.customer_type || null;
  if (d.primary_business_unit_id !== undefined) patch.primary_business_unit_id = d.primary_business_unit_id || null;
  const supabase = await createAuditedClient();
  const { error } = await supabase.from('customers').update(patch).eq('id', d.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/customers');
  return { ok: true };
}

export async function setCustomerStatus(id: string, status: 'active' | 'inactive'): Promise<ActionResult> {
  if (!(await currentSession())) return { ok: false, error: 'Sign in required' };
  const supabase = await createAuditedClient();
  const { error } = await supabase.from('customers').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/customers');
  return { ok: true };
}
