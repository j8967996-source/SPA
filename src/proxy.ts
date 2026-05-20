import { NextResponse, type NextRequest } from 'next/server';

// Keep in sync with SESSION_COOKIE in src/lib/session.ts (that module is
// server-only and cannot be imported into the edge proxy).
const SESSION_COOKIE = 'hhg_spa_session';

// Next.js 16 renamed the "middleware" file convention to "proxy".
export function proxy(req: NextRequest) {
  // Dev-only login bypass — let everything through.
  if (process.env.AUTH_BYPASS === 'true') return NextResponse.next();

  const hasSession = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;
  const isLogin = pathname === '/login';

  if (!hasSession && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Protect everything except Next internals, static assets and the auth API
// (logout must run without a session bounce).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
