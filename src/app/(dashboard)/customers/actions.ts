'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createAuditedClient } from '@/lib/supabase/server';
import { currentSession } from '@/lib/auth';
import { canAccessBranch } from '@/lib/branch-access';
import type { Database } from '@/types/database';

type CustomerUpdate = Database['public']['Tables']['customers']['Update'];

const schema = z.object({
  phone: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  // home_branch_id is required for new customers so every record has a single
  // owning branch — drives the hard branch-scope filter on the customers list
  // and gates updates / status-changes via canAccessBranch.
  home_branch_id: z.string().uuid({ message: 'Home branch is required' }),
  gender: z.enum(['M', 'F', 'Other']).optional().nullable(),
  email: z.string().email().max(120).optional().nullable().or(z.literal('')),
  dob: z.string().optional().nullable().or(z.literal('')),
  customer_type: z.string().max(40).optional().nullable(),
  primary_business_unit_id: z.string().uuid().optional().nullable(),
});

const updateSchema = schema.partial({ phone: true, home_branch_id: true }).extend({ id: z.string().uuid() });

export type ActionResult = { ok: true } | { ok: false; error: string };

// Read-then-check helper: load a customer's home_branch_id and reject when the
// caller can't access that branch. NULL home_branch_id is treated as
// admin-only (legacy rows that pre-date branch scope).
async function requireCustomerBranchAccess(id: string): Promise<{ ok: false; error: string } | { ok: true }> {
  const supabase = await createAuditedClient();
  const { data } = await supabase.from('customers').select('home_branch_id').eq('id', id).maybeSingle();
  if (!data) return { ok: false, error: 'Customer not found' };
  if (!data.home_branch_id) return { ok: false, error: 'No access to this customer (no branch assigned)' };
  if (!(await canAccessBranch(data.home_branch_id))) return { ok: false, error: 'No access to this branch' };
  return { ok: true };
}

export async function createCustomer(input: unknown): Promise<ActionResult> {
  if (!(await currentSession())) return { ok: false, error: 'Sign in required' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  // The new customer's home branch must be one the user can access (admin
  // gets a free pass via canAccessBranch). No "create for another branch".
  if (!(await canAccessBranch(d.home_branch_id))) return { ok: false, error: 'No access to this branch' };
  const supabase = await createAuditedClient();
  const { error } = await supabase.from('customers').insert({
    phone: d.phone,
    name: d.name,
    home_branch_id: d.home_branch_id,
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
  const auth = await requireCustomerBranchAccess(d.id);
  if (!auth.ok) return auth;
  // Editing home_branch_id reassigns ownership — the caller must also have
  // access to the TARGET branch (you can't "donate" a customer to a branch
  // you can't see).
  if (d.home_branch_id !== undefined && !(await canAccessBranch(d.home_branch_id))) {
    return { ok: false, error: 'No access to the target branch' };
  }
  const patch: CustomerUpdate = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.home_branch_id !== undefined) patch.home_branch_id = d.home_branch_id;
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
  const auth = await requireCustomerBranchAccess(id);
  if (!auth.ok) return auth;
  const supabase = await createAuditedClient();
  const { error } = await supabase.from('customers').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/customers');
  return { ok: true };
}
