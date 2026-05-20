'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  employee_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  shift_date: z.string().min(1),
  shift_type: z.enum(['regular', 'cross_branch', 'on_call', 'off', 'leave']),
  shift_start: z.string().optional().nullable(),
  shift_end: z.string().optional().nullable(),
  leave_type: z.enum(['sick', 'vacation', 'personal', 'unpaid']).optional().nullable(),
  resource_id: z.string().uuid().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

const TIMED = ['regular', 'cross_branch', 'on_call'];

// One shift per (employee, date, branch) cell: replace whatever's there.
export async function setShift(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;

  const timed = TIMED.includes(d.shift_type);
  if (timed && (!d.shift_start || !d.shift_end)) {
    return { ok: false, error: 'Start and end time are required for this shift type' };
  }
  if (timed && d.shift_end! <= d.shift_start!) {
    return { ok: false, error: 'End time must be after start time' };
  }
  if (d.shift_type === 'leave' && !d.leave_type) {
    return { ok: false, error: 'Pick a leave type' };
  }

  const supabase = createServiceClient();

  // A station can only be assigned to a timed shift, and must belong to the branch.
  let resourceId: string | null = null;
  if (timed && d.resource_id) {
    const { data: res } = await supabase
      .from('resources')
      .select('id')
      .eq('id', d.resource_id)
      .eq('branch_id', d.branch_id)
      .maybeSingle();
    if (!res) return { ok: false, error: 'Selected station does not belong to this branch' };
    resourceId = d.resource_id;
  }

  await supabase
    .from('employee_shifts')
    .delete()
    .eq('employee_id', d.employee_id)
    .eq('branch_id', d.branch_id)
    .eq('shift_date', d.shift_date);

  const { error } = await supabase.from('employee_shifts').insert({
    employee_id: d.employee_id,
    branch_id: d.branch_id,
    shift_date: d.shift_date,
    shift_type: d.shift_type,
    shift_start: timed ? d.shift_start : null,
    shift_end: timed ? d.shift_end : null,
    leave_type: d.shift_type === 'leave' ? d.leave_type : null,
    resource_id: resourceId,
    note: d.note || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/shift-schedule');
  return { ok: true };
}

export async function clearShift(
  employeeId: string,
  branchId: string,
  shiftDate: string,
): Promise<ActionResult> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('employee_shifts')
    .delete()
    .eq('employee_id', employeeId)
    .eq('branch_id', branchId)
    .eq('shift_date', shiftDate);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/shift-schedule');
  return { ok: true };
}
