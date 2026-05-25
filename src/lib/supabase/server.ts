import 'server-only';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import type { Database } from '@/types/database';
import { readSession } from '@/lib/session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
if (!SUPABASE_PUBLISHABLE_KEY)
  throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');

/**
 * Server-side Supabase client tied to the current request's cookies.
 * Use in Server Components / route handlers for user-context reads.
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* called from Server Component — Next will handle */
        }
      },
    },
  });
}

/**
 * Service-role Supabase client. Bypasses RLS.
 * Only call from trusted server-side code (route handlers, server actions).
 * Never expose to the browser.
 */
export function createServiceClient(staffUserId?: string | null) {
  if (!SUPABASE_SECRET_KEY)
    throw new Error('SUPABASE_SECRET_KEY is not set (required for service client)');
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // When a staff user is supplied, tag every request so the audit_log trigger
    // can attribute the change (read via PostgREST's request.headers).
    ...(staffUserId ? { global: { headers: { 'x-staff-user-id': staffUserId } } } : {}),
  });
}

/**
 * Service client that tags writes with the current staff user for the audit
 * log. Use this in server actions that mutate audited tables so the change is
 * attributed; plain createServiceClient() is fine for reads.
 */
export async function createAuditedClient() {
  const session = await readSession();
  return createServiceClient(session?.staffUserId ?? null);
}
