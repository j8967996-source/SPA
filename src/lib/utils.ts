import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind class merger used by shadcn/ui components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format cents (integer × 100) as PHP currency string.
 * 1000 → "₱10.00"
 */
export function formatPHP(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

/**
 * Generate a date-based sequence number prefix.
 * Used for order_no (SOYYYYMMDD-XXX), SOA, etc.
 */
export function dateSeqPrefix(prefix: string, date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${prefix}${yyyy}${mm}${dd}`;
}

/**
 * Pad a number to N digits.
 */
export function pad(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}
