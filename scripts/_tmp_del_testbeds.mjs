import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const env = Object.fromEntries(readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const one = (v) => (Array.isArray(v) ? v[0] ?? null : v);

// Lock onto the two ALIBABABA test beds named "Bad Bed 1" / "bad bed 2".
const { data: cand } = await supabase
  .from('resources')
  .select('id, resource_name, business_unit_id, branch:branches ( code )')
  .ilike('resource_name', '%bad bed%');
const targets = (cand ?? []).filter((r) => one(r.branch)?.code === 'ALIBABABA');
console.log('Candidates to delete:');
for (const r of targets) console.log(`  ${r.resource_name}  (${r.id})  branch=${one(r.branch)?.code}`);

if (targets.length === 0) { console.log('Nothing matched — aborting.'); process.exit(0); }

// Safety: refuse if any order_item references them.
const ids = targets.map((r) => r.id);
const { data: refs } = await supabase.from('order_items').select('id').in('resource_id', ids).limit(1);
if (refs && refs.length > 0) {
  console.log('\nABORTED: at least one order_item references these resources. Not deleting.');
  process.exit(1);
}

const { error } = await supabase.from('resources').delete().in('id', ids);
if (error) { console.log('\nDELETE ERROR:', error.message); process.exit(1); }
console.log(`\nDeleted ${ids.length} resource(s).`);

const { count } = await supabase.from('resources').select('id', { count: 'exact', head: true });
console.log('Remaining resources:', count);
