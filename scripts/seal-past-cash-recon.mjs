import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const env = Object.fromEntries(readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i+1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const todayPHT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const now = new Date().toISOString();
const SHIFT_KEY = 'cash_shift_config';

const { data: staffs } = await sb.from('staff_users').select('id, display_name, role').eq('active', true);
const actor = (staffs ?? []).find(s => s.role === 'admin') ?? staffs?.[0];
console.log(`Using cashier = ${actor.display_name} (${actor.id})\n`);

async function shiftNames(branchId) {
  const { data: rows } = await sb.from('settings').select('value, branch_id').eq('key', SHIFT_KEY).or(`branch_id.eq.${branchId},branch_id.is.null`);
  const v = (rows ?? []).find((r) => r.branch_id === branchId)?.value ?? (rows ?? []).find((r) => r.branch_id === null)?.value;
  if (v) { try { const c = JSON.parse(v); if (c?.shifts?.length) return c.shifts.map((s) => s.name); } catch {} }
  return ['Full day'];
}

const { data: closedDays } = await sb.from('business_day_close').select('branch_id, business_date, branch:branches!business_day_close_branch_id_fkey ( code )').lt('business_date', todayPHT).eq('status', 'closed');
let updated = 0, inserted = 0;
for (const d of closedDays ?? []) {
  const code = (Array.isArray(d.branch) ? d.branch[0] : d.branch)?.code;
  const names = await shiftNames(d.branch_id);
  for (const label of names) {
    const { data: existing } = await sb.from('cash_reconciliations').select('id, status').eq('branch_id', d.branch_id).eq('reconciliation_date', d.business_date).eq('shift_label', label).maybeSingle();
    if (existing?.status === 'closed') continue;
    if (existing) {
      await sb.from('cash_reconciliations').update({ status: 'closed', closed_at: now, variance_reason: 'Test data cleanup — bypass ERP' }).eq('id', existing.id);
      console.log(`  ✓ update ${d.business_date} ${code} ${label}`);
      updated += 1;
    } else {
      const { error } = await sb.from('cash_reconciliations').insert({
        branch_id: d.branch_id, reconciliation_date: d.business_date, shift_label: label,
        cashier_user_id: actor.id,
        opening_float_cents: 0, previous_shift_handover_cents: 0,
        system_cash_in_cents: 0, system_cash_out_cents: 0, system_expected_cents: 0,
        closing_count_cents: 0, actual_received_cents: 0,
        variance_cents: 0, variance_reason: 'Test data cleanup — bypass ERP',
        status: 'closed', counted_by_staff_id: actor.id, closed_at: now,
      });
      if (error) { console.log(`  ✗ ${d.business_date} ${code} ${label}: ${error.message}`); continue; }
      console.log(`  ✓ insert ${d.business_date} ${code} ${label}`);
      inserted += 1;
    }
  }
}
const { data: stillOpen } = await sb.from('cash_reconciliations').select('reconciliation_date, shift_label, branch:branches!cash_reconciliations_branch_id_fkey ( code )').lt('reconciliation_date', todayPHT).neq('status', 'closed');
console.log(`\nRemaining open past cash recon: ${stillOpen?.length ?? 0}`);
console.log(`Done. updated=${updated}, inserted=${inserted}`);
process.exit(0);
