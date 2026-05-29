#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const envText = readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

async function main() {
  console.log('=== STAFF USERS AUDIT ===\n');
  
  const { data: users, error: e1 } = await supabase
    .from('staff_users')
    .select('id, email, display_name, role, home_branch_id, active, acumatica_user_id');
  if (e1) throw e1;
  
  console.log(`Total staff users: ${users?.length || 0}\n`);
  
  const roleCounts = {};
  (users || []).forEach(u => {
    roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
  });
  console.log('By role:');
  Object.entries(roleCounts).forEach(([role, count]) => {
    console.log(`  ${role}: ${count}`);
  });
  console.log();
  
  console.log('=== STAFF USER BRANCH ASSIGNMENTS ===\n');
  const { data: branchLinks, error: e2 } = await supabase
    .from('staff_user_branches')
    .select('staff_user_id, branch_id');
  if (e2) throw e2;
  
  const { data: branches, error: e3 } = await supabase
    .from('branches')
    .select('id, code, name');
  if (e3) throw e3;
  
  const branchMap = Object.fromEntries((branches || []).map(b => [b.id, b]));
  
  console.log('Users with branch assignments:');
  (users || []).forEach(u => {
    const assigned = (branchLinks || [])
      .filter(l => l.staff_user_id === u.id)
      .map(l => branchMap[l.branch_id]?.code || l.branch_id)
      .join(', ');
    const home = u.home_branch_id ? (branchMap[u.home_branch_id]?.code || u.home_branch_id) : 'none';
    console.log(`  ${u.email} (${u.role}): home=${home}, branches=${assigned || 'none'}`);
  });
  
  console.log('\n=== BUSINESS UNIT ASSIGNMENTS ===\n');
  const { data: buLinks, error: e4 } = await supabase
    .from('staff_user_business_units')
    .select('staff_user_id, business_unit_id');
  if (e4) throw e4;
  
  const { data: buses, error: e5 } = await supabase
    .from('business_units')
    .select('id, code, name');
  if (e5) throw e5;
  
  const buMap = Object.fromEntries((buses || []).map(b => [b.id, b]));
  
  console.log('Users with business unit assignments:');
  (users || []).forEach(u => {
    const assigned = (buLinks || [])
      .filter(l => l.staff_user_id === u.id)
      .map(l => buMap[l.business_unit_id]?.code || l.business_unit_id)
      .join(', ');
    console.log(`  ${u.email}: ${assigned || 'none'}`);
  });
  
  console.log('\n=== ACUMATICA INTEGRATION ===\n');
  const withAcu = (users || []).filter(u => u.acumatica_user_id);
  console.log(`Users with acumatica_user_id set: ${withAcu.length}`);
  withAcu.forEach(u => {
    console.log(`  ${u.email} → ${u.acumatica_user_id}`);
  });
}

main().catch(console.error);
