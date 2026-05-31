// Seed 5 HSPA2 sample orders covering each ERP-posting scenario, so the user
// can run Revenue Confirm / SOA / Tip Settlement and visually inspect the
// resulting Acumatica entries.
//
// Created (all on 2026-05-31, HSPA2):
//   #1  Walk-in / Cash                  → PAYMENT-CASH (DR 10108 / CR 40140)
//   #2  Walk-in / PAYMAYA               → PAYMENT-PAYMAYA (DR 10121 / CR 40140)
//   #3  Walk-in / PAYMAYA + tip ₱100    → + PAYMENT-TIP-PAYMAYA (CR 20500 liability)
//   #4  H-Hotel intercompany AR         → settles via SETTLE-AR-INTERCOMPANY (DR 50170)
//   #5  ENGO third-party AR             → settles via SETTLE-AR-BANK or AR-CASH
//
// SVC deposit / redeem skipped for now — needs a separate flow (purchase a
// card first, then redeem). Add if needed.
//
// SAFE TO RE-RUN: doesn't delete anything. Each run creates 5 new orders for
// the day. Order numbers auto-increment from the highest existing one.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const TODAY = '2026-05-31';
const BR_CODE = 'HSPA2';

// ─────────────────────────────────────────────────────────────────────────────
// Lookups — pull everything we need once, fail loudly if missing.
// ─────────────────────────────────────────────────────────────────────────────

async function lookup() {
  const [br, srcs, bills, pms, svcs, prices, emps, ress, dcs] = await Promise.all([
    sb.from('branches').select('id, code').eq('code', BR_CODE).single(),
    sb.from('customer_sources').select('id, code, default_billing_to_id').eq('active', true),
    sb.from('billing_destinations').select('id, code, default_payment_method_id').eq('active', true),
    sb.from('payment_methods').select('id, code').eq('active', true),
    sb.from('service_items').select('id, code, name, duration_minutes, service_group, service_category_id, required_resource_type').eq('active', true),
    sb.from('service_item_prices').select('service_item_id, price_cents, branch_id, effective_from, effective_to'),
    sb.from('employees').select('id, name, home_branch_id, status').eq('status', 'active'),
    sb.from('resources').select('id, resource_type, resource_name').eq('status', 'active'),
    sb.from('discount_classes').select('id, code').eq('code', 'DIS-00').single(),
  ]);
  if (br.error) throw br.error;
  if (dcs.error) throw new Error('DIS-00 missing — seed discount_classes first');
  const noDiscount = dcs.data;

  // Active price for a service (branch-specific > global, latest effective_from)
  const priceFor = (svcId) => {
    const eligible = (prices.data ?? []).filter((p) =>
      p.service_item_id === svcId
      && p.effective_from <= TODAY
      && (!p.effective_to || p.effective_to >= TODAY)
      && (!p.branch_id || p.branch_id === br.data.id)
    );
    eligible.sort((a, b) => {
      if ((!!a.branch_id) !== (!!b.branch_id)) return a.branch_id ? -1 : 1; // branch-specific first
      return b.effective_from.localeCompare(a.effective_from); // latest first
    });
    return eligible[0]?.price_cents ?? null;
  };

  const findSvc = (code) => svcs.data.find((s) => s.code === code) ?? (() => { throw new Error(`Service ${code} missing`); })();
  const findSrc = (code) => srcs.data.find((s) => s.code === code) ?? (() => { throw new Error(`Source ${code} missing`); })();
  const findBill = (code) => bills.data.find((b) => b.code === code) ?? (() => { throw new Error(`Billing ${code} missing`); })();
  const findPm = (code) => pms.data.find((p) => p.code === code) ?? (() => { throw new Error(`PaymentMethod ${code} missing`); })();
  const findRes = (type) => (ress.data ?? []).find((r) => r.resource_type === type)
    ?? (() => { throw new Error(`Resource type ${type} missing at branch`); })();

  // Therapist for HSPA2 (any active employee with home_branch_id = HSPA2; fall
  // back to any active employee if none — we just need a valid FK).
  const osp2Emps = (emps.data ?? []).filter((e) => e.home_branch_id === br.data.id);
  const therapist = osp2Emps[0] ?? emps.data?.[0] ?? null;
  if (!therapist) throw new Error('No active employees at all');

  return { br: br.data, srcs: srcs.data, bills: bills.data, pms: pms.data,
    svcs: svcs.data, findSvc, findSrc, findBill, findPm, findRes, therapist, priceFor,
    noDiscount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Order number sequencer — increments from current max for today.
// ─────────────────────────────────────────────────────────────────────────────

async function nextOrderNo(branchId) {
  const ymd = TODAY.replace(/-/g, '');
  const prefix = `SO-${BR_CODE}-${ymd}-`;
  const { data } = await sb.from('orders')
    .select('order_no')
    .eq('branch_id', branchId)
    .like('order_no', `${prefix}%`)
    .order('order_no', { ascending: false })
    .limit(1);
  const seq = data?.[0] ? Number(data[0].order_no.slice(prefix.length)) : 0;
  return (n) => `${prefix}${String(seq + n).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build one complete order — order + customer + service line + (optional) payment.
// ─────────────────────────────────────────────────────────────────────────────

async function createScenario({ ctx, label, sourceCode, billingCode, svcCode, paymentMethodCode, tipCents = 0, guestName }) {
  const src = ctx.findSrc(sourceCode);
  const bill = billingCode ? ctx.findBill(billingCode) : null;
  const svc = ctx.findSvc(svcCode);
  const price = ctx.priceFor(svc.id);
  if (!price) throw new Error(`No price for ${svcCode}`);
  const res = ctx.findRes(svc.required_resource_type ?? 'massage_bed');

  const billing_to_id = bill?.id ?? src.default_billing_to_id;
  const isAR = paymentMethodCode === 'ar' || !paymentMethodCode;
  // AR-billed orders carry the AR payment_method_id on the order header (so
  // posting knows they're AR). Counter orders leave it null.
  const arPm = isAR ? ctx.findPm('ar') : null;

  const orderNo = ctx.seq();

  // 1. orders header
  const startAt = new Date(`${TODAY}T10:00:00+08:00`);
  const endAt = new Date(startAt.getTime() + (svc.duration_minutes ?? 60) * 60000);

  const { data: ord, error: oe } = await sb.from('orders').insert({
    order_no: orderNo,
    branch_id: ctx.br.id,
    source_id: src.id,
    billing_to_id,
    payment_method_id: arPm?.id ?? null,
    order_type: 'walk_in',
    service_location_type: 'on_site',
    status: 'draft', // will be promoted below
    service_date: TODAY,
    subtotal_cents: 0,
    discount_cents: 0,
    total_cents: 0,
    paid_cents: 0,
  }).select('id').single();
  if (oe) throw new Error(`Order header: ${oe.message}`);

  // 2. order_customers — one guest
  const { data: oc, error: ce } = await sb.from('order_customers').insert({
    order_id: ord.id,
    customer_name: guestName,
    seq_no: 1,
  }).select('id').single();
  if (ce) throw new Error(`Order customer: ${ce.message}`);

  // 3. order_items — the service line, marked service_completed
  const { error: ie } = await sb.from('order_items').insert({
    order_id: ord.id,
    order_customer_id: oc.id,
    service_item_id: svc.id,
    service_category_id: svc.service_category_id,
    discount_class_id: ctx.noDiscount.id,
    therapist_id: ctx.therapist.id,
    therapist_home_branch_id: ctx.therapist.home_branch_id,
    commission_branch_id: ctx.br.id,
    resource_id: res.id,
    scheduled_start: startAt.toISOString(),
    actual_start: startAt.toISOString(),
    actual_end: endAt.toISOString(),
    service_start: startAt.toISOString(),
    service_end: endAt.toISOString(),
    slot_start: startAt.toISOString(),
    slot_end: endAt.toISOString(),
    duration_minutes: svc.duration_minutes,
    actual_duration_minutes: svc.duration_minutes,
    list_price_cents: price,
    discount_amount_cents: 0,
    final_amount_cents: price,
    commission_rate: 0,
    commission_amount_cents: 0,
    item_seq: 1,
    status: 'service_completed',
  });
  if (ie) throw new Error(`Order item: ${ie.message}`);

  // 4. update order totals
  await sb.from('orders').update({
    subtotal_cents: price,
    total_cents: price,
    // Counter orders: paid up. AR orders: stay at 0 paid, status=completed (AR billed).
    paid_cents: isAR ? 0 : price,
    status: isAR ? 'completed' : 'paid',
  }).eq('id', ord.id);

  // 5. payment (counter only)
  let payDesc = 'AR — no counter payment';
  if (!isAR) {
    const pm = ctx.findPm(paymentMethodCode);
    const paidAt = new Date(endAt.getTime() + 60000).toISOString();
    const { data: pay, error: pe } = await sb.from('payments').insert({
      order_id: ord.id,
      order_customer_id: oc.id,
      payment_method_id: pm.id,
      amount_cents: price,
      paid_at: paidAt,
    }).select('id').single();
    if (pe) throw new Error(`Payment: ${pe.message}`);
    payDesc = `${paymentMethodCode.toUpperCase()} ₱${price/100}`;

    // tip (if any)
    if (tipCents > 0) {
      const { error: te } = await sb.from('tips').insert({
        order_id: ord.id,
        order_item_id: (await sb.from('order_items').select('id').eq('order_id', ord.id).single()).data.id,
        therapist_id: ctx.therapist.id,
        payment_id: pay.id,
        amount_cents: tipCents,
        status: 'open',
      });
      if (te) throw new Error(`Tip: ${te.message}`);
      payDesc += ` + ₱${tipCents/100} tip`;
    }
  }

  return { orderNo, label, status: isAR ? 'completed (AR)' : 'paid', svcCode, price: `₱${price/100}`, payDesc };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const ctx = await lookup();
const seqFn = await nextOrderNo(ctx.br.id);
let n = 0;
ctx.seq = () => seqFn(++n);

console.log(`Seeding 5 sample orders for HSPA2 on ${TODAY} (therapist=${ctx.therapist.name})\n`);

const scenarios = [
  { label: 'Walk-in / Cash',                  sourceCode: 'WALK-IN', billingCode: 'SELF', svcCode: 'M60T',  paymentMethodCode: 'cash',    guestName: 'Maria Santos' },
  { label: 'Walk-in / PAYMAYA',               sourceCode: 'WALK-IN', billingCode: 'SELF', svcCode: 'M90T',  paymentMethodCode: 'paymaya', guestName: 'Anna Cruz' },
  { label: 'Walk-in / PAYMAYA + Tip',         sourceCode: 'WALK-IN', billingCode: 'SELF', svcCode: 'M60F',  paymentMethodCode: 'paymaya', tipCents: 10000, guestName: 'Lisa Reyes' },
  { label: 'H-Hotel intercompany (AR)',       sourceCode: 'H-HOTEL', billingCode: null,   svcCode: 'M60C',  paymentMethodCode: null,      guestName: 'Hotel Guest #1' },
  { label: 'ENGO third-party (AR)',           sourceCode: 'ENGO',    billingCode: null,   svcCode: 'H_CUT', paymentMethodCode: null,      guestName: 'ENGO Guest #1' },
];

const results = [];
for (const s of scenarios) {
  try {
    const r = await createScenario({ ctx, ...s });
    console.log(`  ✓ ${r.orderNo}  ${r.label.padEnd(35)} ${r.svcCode} ${r.price.padStart(8)}  ${r.payDesc}`);
    results.push(r);
  } catch (e) {
    console.log(`  ✗ ${s.label}: ${e.message}`);
  }
}

console.log('\n=== Summary ===');
console.log(`Created: ${results.length} / ${scenarios.length}`);
console.log(`Date:    ${TODAY}`);
console.log(`Branch:  HSPA2`);
console.log('\nTo flush to Acumatica:');
console.log('  1. /reconciliation/cash         — close HSPA2 today\'s shift(s)');
console.log('  2. /reconciliation/revenue-confirm — confirm to post GL journals');
console.log('  3. /reconciliation/soa          — generate SOA for H-Hotel + ENGO AR orders');
console.log('  4. (after settlement)            — SOA payment → posts AR receipts');
console.log('  5. /reconciliation/tips         — settle PAYMAYA tip → posts AP bill');
