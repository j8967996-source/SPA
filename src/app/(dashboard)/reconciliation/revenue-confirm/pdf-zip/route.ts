import { NextResponse, type NextRequest } from 'next/server';
import JSZip from 'jszip';

import { renderRevenueConfirmPdf } from '@/lib/revenue-confirm-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bundle selected Revenue Confirm batches into one ZIP — one PDF per voucher.
// `batches` = comma-separated Acumatica GL batch numbers.
export async function GET(req: NextRequest) {
  const batches = (new URL(req.url).searchParams.get('batches') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (batches.length === 0) return new NextResponse('No batches', { status: 400 });

  const zip = new JSZip();
  let added = 0;
  for (const b of batches.slice(0, 100)) {
    const r = await renderRevenueConfirmPdf(b);
    if (r) { zip.file(r.filename, r.buffer); added += 1; }
  }
  if (added === 0) return new NextResponse('No batches found', { status: 404 });

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="revenue-confirm-${stamp}.zip"`,
    },
  });
}
