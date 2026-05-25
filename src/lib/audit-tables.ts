// Tables that carry the audit trigger (matches migration 20260525170000).
// Drives the Audit Log filter dropdown — kept out of the 'use server' actions
// file because that file may only export async functions.
export const AUDITED_TABLES = [
  'orders', 'order_items', 'order_customers', 'payments', 'tips', 'order_adjustments',
  'stored_value_cards', 'stored_value_transactions', 'cash_reconciliations',
  'tip_settlements', 'commission_periods', 'commission_entries',
  'revenue_soa', 'revenue_soa_orders', 'revenue_soa_payments', 'soa_adjustments',
  'business_day_close', 'feedback',
  'service_items', 'service_item_prices', 'discount_classes', 'payment_methods',
  'billing_destinations', 'transaction_codes', 'customer_sources', 'commission_classes',
  'branches', 'business_units', 'employees', 'employee_shifts', 'resources',
  'reservations', 'customers', 'staff_users', 'role_permissions', 'settings',
] as const;
