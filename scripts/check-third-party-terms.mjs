#!/usr/bin/env node
// One-off: confirm THIRD-PARTY billing's credit_terms_days + show that SOA's
// due_date / issued_date, to explain why Overdue reads 0 in AR Balance.

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

console.log('--- billing_destinations (THIRD-PARTY + ENGO) ---');
const { data: bd } = await sb.from('billing_destinations')
  .select('code, settlement_type, credit_terms_days, intercompany_account')
  .in('code', ['THIRD-PARTY', 'ENGO', 'HHO']);
for (const b of bd ?? []) console.log(b);

console.log('\n--- open SOAs and their due_date ---');
const { data: soas } = await sb.from('revenue_soa')
  .select('soa_no, settlement_type, issued_date, due_date, outstanding_cents, status, billing:billing_destinations ( code, credit_terms_days )')
  .in('status', ['issued', 'partial_paid'])
  .order('soa_no');
for (const s of soas ?? []) {
  const b = Array.isArray(s.billing) ? s.billing[0] : s.billing;
  console.log(`${s.soa_no.padEnd(34)} | ${s.settlement_type?.padEnd(13)} | issued ${s.issued_date} | due ${s.due_date ?? '(null)'} | outstanding ${(s.outstanding_cents/100).toFixed(2)} | ${s.status} | billing ${b?.code} terms=${b?.credit_terms_days}`);
}
process.exit(0);
