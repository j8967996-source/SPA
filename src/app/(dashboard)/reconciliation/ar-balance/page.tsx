import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// AR Balance now lives as a view inside Revenue SOA (one receivables hub).
// Keep this route working for old links / bookmarks by sending it to that view.
export default function ArBalanceRedirect() {
  redirect('/reconciliation/soa?view=ar');
}
