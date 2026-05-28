// One-off rollback: take today's seeded OSP2 orders that were Revenue
// Confirm-ed (status='closed' with a gl_batch_nbr) and step them back to
// their pre-confirm state — paid orders → 'paid', AR-completed → 'completed'
// — clearing all posting metadata so they can be re-confirmed by the new
// batched flow.
//
// NOTE: this does NOT touch Acumatica. The 10 GL journals already pushed in
// the per-order test will stay in the ERP (the user can reverse them there
// if they care). The new test will create one fresh batched journal.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const now = new Date().toISOString();
console.log(`Today PHT = ${today}\n`);

// ar method id (so we can tell paid orders from AR-completed ones)
const { data: ar } = await sb.from('payment_methods').select('id').eq('code', 'ar').single();
const AR_ID = ar.id;

// All today's closed orders for OSP2 — we only revert ones with gl_batch_nbr
// set (i.e. they actually went through Revenue Confirm).
const { data: br } = await sb.from('branches').select('id').eq('code', 'OSP2').single();
const { data: orders } = await sb.from('orders')
  .select('id, order_no, status, gl_batch_nbr, posting_status, billing:billing_destinations!orders_billing_to_id_fkey(default_payment_method_id)')
  .eq('branch_id', br.id)
  .eq('service_date', today)
  .eq('status', 'closed');

console.log(`Found ${orders?.length ?? 0} closed orders for today at OSP2.\n`);

let reverted = 0;
for (const o of orders ?? []) {
  const billing = Array.isArray(o.billing) ? o.billing[0] : o.billing;
  const isAR = billing?.default_payment_method_id === AR_ID;
  const target = isAR ? 'completed' : 'paid';
  const { error } = await sb.from('orders').update({
    status: target,
    gl_batch_nbr: null,
    posting_status: null,
    posting_error: null,
  }).eq('id', o.id);
  if (error) { console.log(`  ✗ ${o.order_no}: ${error.message}`); continue; }
  await sb.from('order_status_log').insert({
    entity_type: 'order', entity_id: o.id,
    from_status: 'closed', to_status: target,
    reason: `Rollback: was GL ${o.gl_batch_nbr ?? '?'} (test data — Acumatica side not reversed)`,
    changed_at: now,
  });
  console.log(`  ✓ ${o.order_no.padEnd(28)} closed → ${target} (cleared GL ${o.gl_batch_nbr ?? '?'})`);
  reverted += 1;
}

console.log(`\nDone. Reverted ${reverted} order(s).`);
process.exit(0);
