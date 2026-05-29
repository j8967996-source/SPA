import { NextResponse, type NextRequest } from 'next/server';

import { renderRevenueConfirmPdf } from '@/lib/revenue-confirm-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Render the per-batch (= per-day, per-branch) Revenue Confirm voucher PDF on
// demand. Same identifier as Acumatica's GL voucher number.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ batch: string }> }) {
  const { batch } = await params;
  const r = await renderRevenueConfirmPdf(batch);
  if (!r) return new NextResponse('Batch not found', { status: 404 });
  return new NextResponse(new Uint8Array(r.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${r.filename}"`,
    },
  });
}
