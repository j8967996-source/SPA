import 'server-only';
import bcrypt from 'bcryptjs';

import { createServiceClient } from '@/lib/supabase/server';
import { readSession, type SessionPayload } from '@/lib/session';

export type Role = SessionPayload['role'];

/** Verify email + password against staff_users (local bcrypt). */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionPayload | null> {
  const supabase = createServiceClient();
  const { data: u } = await supabase
    .from('staff_users')
    .select('id, email, acumatica_user_id, display_name, role, home_branch_id, active, password_hash')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (!u || !u.active || !u.password_hash) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  await supabase.from('staff_users').update({ last_login_at: new Date().toISOString() }).eq('id', u.id);
  return {
    staffUserId: u.id,
    email: u.email,
    acumaticaUserId: u.acumatica_user_id,
    displayName: u.display_name,
    role: u.role as Role,
    homeBranchId: u.home_branch_id,
  };
}

// Dev-only login bypass: when AUTH_BYPASS=true and there is no real session,
// act as the seeded admin. Controlled by env (default off) so it never ships on.
async function bypassAdminSession(): Promise<SessionPayload | null> {
  if (process.env.AUTH_BYPASS !== 'true') return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('staff_users')
    .select('id, email, acumatica_user_id, display_name, role, home_branch_id')
    .eq('email', 'admin@acumatica.local')
    .maybeSingle();
  if (data) {
    return {
      staffUserId: data.id,
      email: data.email,
      acumaticaUserId: data.acumatica_user_id,
      displayName: data.display_name,
      role: data.role as Role,
      homeBranchId: data.home_branch_id,
    };
  }
  return {
    staffUserId: '00000000-0000-0000-0000-000000000000',
    email: 'admin@acumatica.local',
    acumaticaUserId: 'admin',
    displayName: 'System Admin (bypass)',
    role: 'admin',
    homeBranchId: null,
  };
}

export async function currentSession(): Promise<SessionPayload | null> {
  return (await readSession()) ?? (await bypassAdminSession());
}

export function isManager(s: SessionPayload | null): boolean {
  return !!s && (s.role === 'manager' || s.role === 'admin');
}

export function isAdmin(s: SessionPayload | null): boolean {
  return !!s && s.role === 'admin';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
