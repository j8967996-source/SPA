// Reset the three SOAs that were just settled (as 3 separate Acumatica
// journals — F00188170 / 171 / 172) back to `issued` so we can re-test the
// new batch-settle path that should produce ONE journal for all three.
//
// Note: this undoes things on OUR side only. Acumatica still has the three
// journals — for the test you can either leave them as orphans or void them
// from the ERP UI. The point of this reset is to free the SOA rows so AR
// Balance shows them again and we can click "Settle & post" once.
//
// Reset = settled → issued, clear paid_cents + outstanding restored, drop
// posting columns (gl_batch_nbr / posting_status / posting_error). Order
// links (revenue_soa_orders) are kept — same SOAs, same totals.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const RESET = [
  'SOA-202605-HJH-OSP2-001',
  'SOA-202605-HCC-002',
  'SOA-202605-HHO-OSP2-003',
];

console.log('=== Reset settled → issued (clear posting + restore outstanding) ===');
for (const soaNo of RESET) {
  const { data: soa } = await sb.from('revenue_soa')
    .select('id, status, total_cents, gl_batch_nbr')
    .eq('soa_no', soaNo).maybeSingle();
  if (!soa) { console.log(`  · ${soaNo} not found, skipping`); continue; }
  if (soa.status === 'issued') { console.log(`  · ${soaNo} already issued`); continue; }

  const { error } = await sb.from('revenue_soa').update({
    status: 'issued',
    paid_cents: 0,
    outstanding_cents: soa.total_cents,
    gl_batch_nbr: null,
    posting_status: null,
    posting_error: null,
  }).eq('id', soa.id);
  if (error) { console.log(`  ✗ ${soaNo}: ${error.message}`); continue; }
  console.log(`  ✓ ${soaNo}  ₱${soa.total_cents / 100} → issued  (was GL #${soa.gl_batch_nbr ?? '—'})`);
}

console.log('\n=== Open intercompany SOAs after reset (these will batch into ONE journal) ===');
const { data: open } = await sb.from('revenue_soa')
  .select('soa_no, status, settlement_type, period_from, period_to, total_cents, branch:branches ( code )')
  .eq('settlement_type', 'intercompany')
  .in('status', ['issued', 'partial_paid'])
  .order('soa_no', { ascending: false });
let grandTotal = 0;
const byBranch = new Map();
for (const s of open ?? []) {
  const code = s.branch?.code ?? '—';
  console.log(`  ${s.soa_no.padEnd(34)} ${code.padEnd(6)} ${s.status.padEnd(13)} ${s.period_from}~${s.period_to}  ₱${s.total_cents / 100}`);
  grandTotal += s.total_cents;
  byBranch.set(code, (byBranch.get(code) ?? 0) + 1);
}
console.log(`\n  Total: ₱${grandTotal / 100} across ${byBranch.size} branch(es)`);
for (const [code, n] of byBranch) console.log(`    ${code}: ${n} SOA${n > 1 ? 's' : ''} → 1 journal`);

console.log('\nDone. Go to /reconciliation/ar-balance → Select all → Settle & post.');
process.exit(0);
