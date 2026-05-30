import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { readAcuSessionCookie, clearAcuSessionCookie } from '@/lib/session';
import { acumaticaLogout } from '@/lib/acumatica';

/**
 * Logout — three things to clean up:
 *   1. Acumatica REST session (best-effort, the ERP times it out anyway).
 *   2. Supabase Auth session (writes deletion cookies via the SSR client).
 *   3. The local httpOnly ACU session cookie.
 *
 * Accepts both GET and POST so a plain anchor tag works (existing UI uses
 * GET) and a fetch-based logout button works too.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  await acumaticaLogout(await readAcuSessionCookie());

  const ssr = await createServerClient();
  await ssr.auth.signOut();

  await clearAcuSessionCookie();

  return NextResponse.redirect(new URL('/login', req.url));
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
