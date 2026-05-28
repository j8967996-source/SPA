#!/usr/bin/env node
// One-off: list transaction_codes (to confirm what's actually configured live,
// e.g. an AR-settle cash code for SOA third-party collection).
// Usage: node scripts/check-tx-codes.mjs

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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: pms } = await supabase.from('payment_methods').select('id, code');
const pmCode = Object.fromEntries((pms ?? []).map((p) => [p.id, p.code]));

const { data, error } = await supabase
  .from('transaction_codes')
  .select('code, transaction_type, payment_method_id, debit_account, debit_subaccount, credit_account, credit_subaccount, active')
  .order('code');
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${data.length} transaction_codes:\n`);
for (const t of data) {
  console.log(
    `${t.code.padEnd(34)} | ${String(t.transaction_type).padEnd(8)} | method=${(pmCode[t.payment_method_id] ?? '—').padEnd(16)} | DR ${t.debit_account ?? '—'}/${t.debit_subaccount ?? '—'} | CR ${t.credit_account ?? '—'}/${t.credit_subaccount ?? '—'} | ${t.active ? 'active' : 'inactive'}`,
  );
}
process.exit(0);
