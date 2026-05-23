'use client';

import { useRouter } from 'next/navigation';

// Per-day reconciliation date picker — navigates as soon as the date changes
// (no Enter needed), swapping the ?date param on the given page.
export function ReconDatePicker({ basePath, branchId, date }: { basePath: string; branchId?: string; date: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      value={date}
      onChange={(e) => {
        if (e.target.value) router.push(`${basePath}?branch=${branchId ?? ''}&date=${e.target.value}`);
      }}
      className="rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm"
    />
  );
}
