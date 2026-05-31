// Seed dev-only staff_users for AUTH_BYPASS role testing. Idempotent: if a
// user already exists by email, leaves it alone (so the script can be re-run
// without nuking your last edit to that row).
//
// After running, switch role by editing .env.local:
//   AUTH_BYPASS=staff-osp1@acumatica.local
// then restart `next dev`. The whole app sees you as that user — no Supabase
// session, no ERP login, no cookie juggling.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

console.log('Looking up branches…');
const { data: branches } = await sb.from('branches').select('id, code').in('code', ['OSP1', 'HSPA2']);
const branchId = Object.fromEntries((branches ?? []).map((b) => [b.code, b.id]));
if (!branchId.OSP1 || !branchId.HSPA2) {
  console.error('✗ OSP1 or HSPA2 branch missing — seed branches first');
  process.exit(1);
}

const USERS = [
  // Mirrors the audit roles. The existing admin@ and jason@ and ep000513@ stay
  // untouched — they're real seed/ERP-bridged users.
  {
    email: 'staff-osp1@acumatica.local',
    acumatica_user_id: 'staff-osp1',
    display_name: 'Test Staff (OSP1)',
    role: 'staff',
    homeBranchCode: 'OSP1',
    branchCodes: ['OSP1'],
  },
  {
    email: 'staff-osp2@acumatica.local',
    acumatica_user_id: 'staff-osp2',
    display_name: 'Test Staff (HSPA2)',
    role: 'staff',
    homeBranchCode: 'HSPA2',
    branchCodes: ['HSPA2'],
  },
  {
    email: 'booker@acumatica.local',
    acumatica_user_id: 'booker',
    display_name: 'Test External Booker',
    role: 'external_booker',
    homeBranchCode: null,
    branchCodes: [],
  },
];

console.log('\n=== Seeding test users ===');
for (const u of USERS) {
  const { data: existing } = await sb.from('staff_users').select('id, role').eq('email', u.email).maybeSingle();
  if (existing) {
    console.log(`  · ${u.email}  already exists (role=${existing.role}) — skip`);
    continue;
  }
  const { data: created, error } = await sb.from('staff_users').insert({
    email: u.email,
    acumatica_user_id: u.acumatica_user_id,
    display_name: u.display_name,
    role: u.role,
    home_branch_id: u.homeBranchCode ? branchId[u.homeBranchCode] : null,
    active: true,
  }).select('id').single();
  if (error) { console.error(`  ✗ ${u.email}: ${error.message}`); continue; }
  console.log(`  ✓ ${u.email}  role=${u.role}  home=${u.homeBranchCode ?? '—'}`);

  // Wire branches in the junction table for the branch-scoped check.
  for (const code of u.branchCodes) {
    const { error: je } = await sb.from('staff_user_branches').insert({
      staff_user_id: created.id,
      branch_id: branchId[code],
    });
    if (je && !/duplicate/i.test(je.message)) console.error(`    ✗ branch ${code}: ${je.message}`);
    else console.log(`    + branch ${code}`);
  }
}

console.log('\n=== Final roster ===');
const { data: all } = await sb.from('staff_users')
  .select('email, role, active, home_branch_id, branches:branches!staff_users_home_branch_id_fkey(code)')
  .order('role').order('email');
for (const u of all ?? []) {
  const home = u.branches?.code ?? '—';
  console.log(`  ${u.role.padEnd(16)} ${u.email.padEnd(32)} home=${home.padEnd(6)} active=${u.active}`);
}

console.log('\nDone.');
console.log('\nNext: edit .env.local with one of these:');
for (const u of USERS) console.log(`  AUTH_BYPASS=${u.email}`);
console.log('  AUTH_BYPASS=jason@acumatica.local           # manager');
console.log('  AUTH_BYPASS=true                              # admin');
console.log('Then restart `next dev` to switch role.');
process.exit(0);
