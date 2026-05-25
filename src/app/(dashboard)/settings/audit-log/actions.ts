'use server';

import { createServiceClient } from '@/lib/supabase/server';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditRow {
  id: number;
  table_name: string;
  row_id: string | null;
  action: AuditAction;
  changed_at: string;
  actor: string | null; // resolved staff name/username, null = system/no header
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditFilters {
  table?: string;
  action?: string;
  from?: string; // yyyy-mm-dd (PHT)
  to?: string;
}

const PAGE_SIZE = 200;

export async function loadAuditLog(filters: AuditFilters): Promise<AuditRow[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('audit_log')
    .select('id, table_name, row_id, action, changed_at, changed_by, before, after')
    .order('changed_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (filters.table) q = q.eq('table_name', filters.table);
  if (filters.action) q = q.eq('action', filters.action);
  // Date range on changed_at (PHT day bounds → UTC-aware via +08:00 offset).
  if (filters.from) q = q.gte('changed_at', `${filters.from}T00:00:00+08:00`);
  if (filters.to) q = q.lte('changed_at', `${filters.to}T23:59:59+08:00`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Resolve "who" — changed_by has no FK, so look up staff_users separately.
  const ids = [...new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase
      .from('staff_users')
      .select('id, display_name, acumatica_user_id')
      .in('id', ids);
    for (const u of users ?? []) nameById.set(u.id, u.display_name || u.acumatica_user_id || u.id);
  }

  return rows.map((r) => ({
    id: r.id,
    table_name: r.table_name,
    row_id: r.row_id,
    action: r.action as AuditAction,
    changed_at: r.changed_at,
    actor: r.changed_by ? (nameById.get(r.changed_by) ?? r.changed_by) : null,
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
  }));
}
