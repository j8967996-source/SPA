// Seed 10 HSPA2 orders for TODAY that cover every ERP-posting path:
//   #1-5  paid via cash / paymaya / mixed (some with PAYMAYA tip)
//   #6    ENGO third-party paid in cash (settles same-day, not via SOA)
//   #7-9  intercompany AR (HHO / HCC / HJH) — completed, awaits Revenue Confirm
//          → then SOA Generate → Settle (DR 50170/T03 / CR 10200)
//   #10   third-party AR (THIRD-PARTY) — completed, awaits Revenue Confirm
//          → then SOA Generate → Record Payment (DR 10111/MBO / CR 10200)
//
// Excluded by design: cancelled, void, partial / unpaid orders. The
// point of this seed is *only* the orders that need to post.

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
const ymd = today.replace(/-/g, '');
const now = new Date().toISOString();

console.log(`Today PHT = ${today}\n`);

// --- Reference ids ---
const { data: br } = await sb.from('branches').select('id').eq('code', 'HSPA2').single();
const BRANCH = br.id;

const { data: pms } = await sb.from('payment_methods').select('id, code').in('code', ['cash', 'paymaya', 'ar']);
const PM = Object.fromEntries(pms.map((p) => [p.code, p.id]));

const { data: srcs } = await sb.from('customer_sources').select('id, code').in('code', ['WALK-IN', 'H-HOTEL', 'C-HOTEL', 'ENGO', 'THIRD-PARTY']);
const SRC = Object.fromEntries(srcs.map((s) => [s.code, s.id]));
// HJH wasn't in our short-list; treat as walk-in for source attribution.
SRC['J-HOTEL'] = SRC['H-HOTEL'];

const { data: bds } = await sb.from('billing_destinations').select('id, code').in('code', ['SELF', 'HHO', 'HCC', 'HJH', 'ENGO', 'THIRD-PARTY']);
const BD = Object.fromEntries(bds.map((b) => [b.code, b.id]));

// Service: Thai Massage 120min (or any active commission_applicable service we find).
const { data: svc } = await sb.from('service_items').select('id, name, duration_minutes, service_category_id').eq('active', true).eq('commission_applicable', true).order('name').limit(1);
const SERVICE = svc[0];
console.log(`Using service: ${SERVICE.name} (${SERVICE.duration_minutes}min)`);

// DIS-00 = no-discount class (every order has to point at one).
const { data: ndc } = await sb.from('discount_classes').select('id').eq('code', 'DIS-00').single();
const NO_DISCOUNT = ndc.id;

// 10 therapists
const { data: emps } = await sb.from('employees').select('id, name').limit(15);
const THERAPISTS = emps.slice(0, 10);

// --- Scenarios ---
const SCENARIOS = [
  { i: 1,  billing: 'SELF',         source: 'WALK-IN',     status: 'paid',      total: 1500, payments: [{ method: 'cash',    amount: 1500 }], tip: 0 },
  { i: 2,  billing: 'SELF',         source: 'WALK-IN',     status: 'paid',      total: 1500, payments: [{ method: 'cash',    amount: 1500 }], tip: 200 },
  { i: 3,  billing: 'SELF',         source: 'WALK-IN',     status: 'paid',      total: 2000, payments: [{ method: 'paymaya', amount: 2000 }], tip: 0 },
  { i: 4,  billing: 'SELF',         source: 'WALK-IN',     status: 'paid',      total: 1800, payments: [{ method: 'paymaya', amount: 1800 }], tip: 300 },
  { i: 5,  billing: 'SELF',         source: 'WALK-IN',     status: 'paid',      total: 2000, payments: [{ method: 'cash', amount: 1000 }, { method: 'paymaya', amount: 1000 }], tip: 0 },
  { i: 6,  billing: 'ENGO',         source: 'ENGO',        status: 'paid',      total: 1500, payments: [{ method: 'cash',    amount: 1500 }], tip: 0 },
  { i: 7,  billing: 'HHO',          source: 'H-HOTEL',     status: 'completed', total: 2200, payments: [], tip: 0 },
  { i: 8,  billing: 'HCC',          source: 'C-HOTEL',     status: 'completed', total: 1900, payments: [], tip: 0 },
  { i: 9,  billing: 'HJH',          source: 'J-HOTEL',     status: 'completed', total: 2400, payments: [], tip: 0 },
  { i: 10, billing: 'THIRD-PARTY',  source: 'THIRD-PARTY', status: 'completed', total: 2100, payments: [], tip: 0 },
];

const guestNames = ['Joey', 'Maya', 'Liam', 'Ava', 'Noah', 'Sofia', 'Lucas', 'Mia', 'Ben', 'Ella'];

let created = 0;
for (const sc of SCENARIOS) {
  const seq = String(sc.i).padStart(3, '0');
  const order_no = `SO-HSPA2-${ymd}-${seq}`;
  const therapist = THERAPISTS[(sc.i - 1) % THERAPISTS.length];
  const totalCents = sc.total * 100;

  // Service window: stagger across the morning so they don't overlap unrealistically
  const startMin = 9 * 60 + (sc.i - 1) * 30; // 09:00, 09:30, ...
  const startIso = isoOnDay(today, Math.floor(startMin / 60), startMin % 60);
  const endIso = isoOnDay(today, Math.floor((startMin + SERVICE.duration_minutes) / 60), (startMin + SERVICE.duration_minutes) % 60);

  // 1) orders
  const orderType = sc.source === 'WALK-IN' ? 'walk_in' : 'external';
  const { data: ord, error: oe } = await sb.from('orders').insert({
    order_no,
    branch_id: BRANCH,
    billing_to_id: BD[sc.billing],
    source_id: SRC[sc.source],
    order_type: orderType,
    status: sc.status,
    service_date: today,
    subtotal_cents: totalCents,
    discount_cents: 0,
    total_cents: totalCents,
    paid_cents: sc.status === 'paid' ? totalCents : 0,
    created_at: now,
    updated_at: now,
  }).select('id').single();
  if (oe) { console.log(`  ✗ ${order_no}: ${oe.message}`); continue; }

  // 2) order_customer
  const guestName = `${guestNames[sc.i - 1]} Test${sc.i}`;
  const { data: oc, error: oce } = await sb.from('order_customers').insert({
    order_id: ord.id, customer_name: guestName, seq_no: 1,
    created_at: now, updated_at: now,
  }).select('id').single();
  if (oce) { console.log(`  ✗ ${order_no} order_customer: ${oce.message}`); continue; }

  // 3) order_item — feedback_done so it counts for commission + tip
  const { data: oi, error: oie } = await sb.from('order_items').insert({
    order_id: ord.id,
    order_customer_id: oc.id,
    service_item_id: SERVICE.id,
    service_category_id: SERVICE.service_category_id,
    therapist_id: therapist.id,
    list_price_cents: totalCents,
    final_amount_cents: totalCents,
    discount_class_id: NO_DISCOUNT,
    discount_amount_cents: 0,
    item_seq: 1,
    duration_minutes: SERVICE.duration_minutes,
    actual_start: startIso,
    actual_end: endIso,
    status: 'feedback_done',
    created_at: now, updated_at: now,
  }).select('id').single();
  if (oie) { console.log(`  ✗ ${order_no} order_item: ${oie.message}`); continue; }

  // 4) payments
  const paymentRows = [];
  for (const p of sc.payments) {
    const { data: pay, error: pe } = await sb.from('payments').insert({
      order_id: ord.id,
      order_customer_id: oc.id,
      payment_method_id: PM[p.method],
      amount_cents: p.amount * 100,
      paid_at: now,
      created_at: now, updated_at: now,
    }).select('id, payment_method_id').single();
    if (pe) { console.log(`  ✗ ${order_no} payment ${p.method}: ${pe.message}`); continue; }
    paymentRows.push({ ...pay, method: p.method });
  }

  // 5) tip — only PAYMAYA tips supported (and only if there's a PAYMAYA payment to ride on)
  if (sc.tip > 0) {
    const paymayaPay = paymentRows.find((p) => p.method === 'paymaya');
    if (paymayaPay) {
      // PAYMAYA already there — attach tip to it
      const { error: te } = await sb.from('tips').insert({
        order_id: ord.id, order_item_id: oi.id, therapist_id: therapist.id,
        payment_id: paymayaPay.id,
        amount_cents: sc.tip * 100,
        status: 'open',
        created_at: now, updated_at: now,
      });
      if (te) console.log(`  ⚠ ${order_no} tip: ${te.message}`);
    } else {
      // Cash payment order with PAYMAYA tip — add a separate PAYMAYA payment for the tip
      const { data: tipPay, error: tpe } = await sb.from('payments').insert({
        order_id: ord.id, order_customer_id: oc.id, payment_method_id: PM['paymaya'],
        amount_cents: sc.tip * 100, paid_at: now, created_at: now, updated_at: now,
      }).select('id').single();
      if (tpe) { console.log(`  ⚠ ${order_no} tip-paymaya-pay: ${tpe.message}`); }
      else {
        await sb.from('tips').insert({
          order_id: ord.id, order_item_id: oi.id, therapist_id: therapist.id,
          payment_id: tipPay.id, amount_cents: sc.tip * 100, status: 'open',
          created_at: now, updated_at: now,
        });
      }
    }
  }

  created += 1;
  const tipStr = sc.tip ? ` + ₱${sc.tip} tip` : '';
  console.log(`  ✓ ${order_no}  ${sc.billing.padEnd(12)} ${sc.status.padEnd(10)} ₱${sc.total}${tipStr}  (${therapist.name})`);
}

console.log(`\nDone. Created ${created}/${SCENARIOS.length} orders.`);
process.exit(0);

function isoOnDay(ymd, hh, mm) {
  // ymd "YYYY-MM-DD" PHT — emit a +08:00 ISO at that wall-clock time.
  return `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`;
}
