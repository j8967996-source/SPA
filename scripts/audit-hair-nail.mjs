// One-off audit: what hair/nail infrastructure is in the live DB right now?
// Output drives the decision on what to add in seed-hair-nail.mjs.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

console.log('=== Positions (hair/nail related) ===');
const { data: pos } = await sb.from('positions').select('id, code, name').order('code');
for (const p of pos ?? []) {
  if (/HAIR|NAIL|MASSAGE|RECEP|MANAGER/i.test(p.code)) console.log(`  ${p.code.padEnd(20)} ${p.name}`);
}

console.log('\n=== Employees by position ===');
const { data: emps } = await sb.from('employees').select('employee_code, name, position_id, home_branch_id, status, branches:branches!employees_home_branch_id_fkey(code)');
const posById = new Map((pos ?? []).map((p) => [p.id, p.code]));
const byPos = new Map();
for (const e of emps ?? []) {
  const code = e.position_id ? posById.get(e.position_id) ?? 'UNKNOWN' : '(no position)';
  if (!byPos.has(code)) byPos.set(code, []);
  byPos.get(code).push(`${e.employee_code} ${e.name} @${e.branches?.code ?? '—'} (${e.status})`);
}
for (const [code, list] of byPos) {
  console.log(`  [${code}] ${list.length} employee(s)`);
  for (const x of list) console.log(`    · ${x}`);
}

console.log('\n=== Resources by type ===');
const { data: res } = await sb.from('resources').select('resource_type, resource_name, branches:branches!resources_branch_id_fkey(code), status').order('resource_type');
const byType = new Map();
for (const r of res ?? []) {
  if (!byType.has(r.resource_type)) byType.set(r.resource_type, []);
  byType.get(r.resource_type).push(`${r.branches?.code ?? '—'} · ${r.resource_name} (${r.status})`);
}
for (const [t, list] of byType) {
  console.log(`  [${t}] ${list.length}`);
  for (const x of list) console.log(`    · ${x}`);
}

console.log('\n=== Service items (HAIR + NAIL categories) ===');
const { data: cats } = await sb.from('service_categories').select('id, code, name');
const targetCats = (cats ?? []).filter((c) => /HAIR|NAIL/i.test(c.code));
for (const c of targetCats) {
  const { data: items } = await sb.from('service_items')
    .select('code, name, duration_minutes, required_resource_type, active')
    .eq('service_category_id', c.id);
  console.log(`  [${c.code}] ${c.name} — ${items?.length ?? 0} item(s)`);
  for (const it of items ?? []) console.log(`    · ${it.code.padEnd(8)} ${it.name.padEnd(28)} ${it.duration_minutes}min  → ${it.required_resource_type}  ${it.active ? '' : '(inactive)'}`);
}

console.log('\n=== Service prices for HAIR + NAIL items ===');
const allHairNailItems = [];
for (const c of targetCats) {
  const { data: items } = await sb.from('service_items').select('id, code, name').eq('service_category_id', c.id);
  allHairNailItems.push(...(items ?? []));
}
if (allHairNailItems.length === 0) {
  console.log('  · no hair/nail service items to price');
} else {
  for (const it of allHairNailItems) {
    const { data: prices } = await sb.from('service_item_prices')
      .select('price_class, branch_id, effective_from, effective_to, price_cents')
      .eq('service_item_id', it.id);
    if (!prices || prices.length === 0) {
      console.log(`  · ${it.code.padEnd(8)} ${it.name}  →  NO PRICE`);
    } else {
      for (const p of prices) {
        console.log(`  · ${it.code.padEnd(8)} ${it.name}  ${p.price_class}  ${p.branch_id ? 'branch' : 'global'}  ${p.effective_from}~${p.effective_to ?? '∞'}  ₱${p.price_cents / 100}`);
      }
    }
  }
}

console.log('\nDone.');
process.exit(0);
