#!/usr/bin/env node
// One-off: backfill due_date on existing third-party SOAs that were generated
// when their billing destination's credit_terms_days was 0 (or before the
// column was set). For each open SOA where settlement_type='third_party' and
// due_date IS NULL, set due_date = issued_date + billing.credit_terms_days (if
// terms > 0). Idempotent — already-set due_dates are left alone.
//
// Usage: node scripts/backfill-soa-due-date.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: candidates, error } = await sb
  .from('revenue_soa')
  .select('id, soa_no, issued_date, billing:billing_destinations ( credit_terms_days )')
  .eq('settlement_type', 'third_party')
  .is('due_date', null)
  .not('status', 'eq', 'void');
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${candidates.length} third-party SOA(s) with null due_date.\n`);

let updated = 0;
let skipped = 0;
for (const s of candidates ?? []) {
  const b = Array.isArray(s.billing) ? s.billing[0] : s.billing;
  const terms = b?.credit_terms_days ?? 0;
  if (!terms || terms <= 0) {
    console.log(`  · ${s.soa_no.padEnd(34)} skipped (billing has terms=${terms})`);
    skipped += 1;
    continue;
  }
  if (!s.issued_date) {
    console.log(`  · ${s.soa_no.padEnd(34)} skipped (no issued_date)`);
    skipped += 1;
    continue;
  }
  // Compute issued_date + terms days. Pure UTC arithmetic so the result is
  // independent of the server's local timezone.
  const [y, m, d] = s.issued_date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + terms);
  const dueDate = dt.toISOString().slice(0, 10);

  const { error: ue } = await sb.from('revenue_soa').update({ due_date: dueDate }).eq('id', s.id);
  if (ue) { console.log(`  · ${s.soa_no.padEnd(34)} ERROR ${ue.message}`); skipped += 1; continue; }
  console.log(`  · ${s.soa_no.padEnd(34)} due_date = ${dueDate} (issued ${s.issued_date} + ${terms}d)`);
  updated += 1;
}

console.log(`\nDone. Updated: ${updated} · Skipped: ${skipped}`);
process.exit(0);
