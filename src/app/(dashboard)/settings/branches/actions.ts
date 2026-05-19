'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/server';

const branchSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_-]+$/, 'Uppercase letters, digits, - and _ only'),
  name: z.string().min(1).max(120),
  business_unit_id: z.string().uuid(),
});

const updateSchema = branchSchema.partial({ code: true }).extend({
  id: z.string().uuid(),
});

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createBranch(input: unknown): Promise<ActionResult> {
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from('branches').insert({
    code: parsed.data.code,
    name: parsed.data.name,
    business_unit_id: parsed.data.business_unit_id,
    active: true,
  });
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `Branch code "${parsed.data.code}" already exists` };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath('/settings/branches');
  return { ok: true };
}

export async function updateBranch(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const supabase = createServiceClient();
  const patch: { name?: string; business_unit_id?: string } = {};
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.business_unit_id) patch.business_unit_id = parsed.data.business_unit_id;
  const { error } = await supabase.from('branches').update(patch).eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/branches');
  return { ok: true };
}

export async function setBranchActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('branches').update({ active }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/branches');
  return { ok: true };
}
