import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'hhg_spa_session';
// Acumatica REST API session cookie — passed from /entity/auth/login Set-Cookie.
// Server-side reads this when posting GL / querying ERP so every action is
// attributed to the user's own Acumatica identity (not a service account).
export const ACU_SESSION_COOKIE = 'acu_session';
const SESSION_TTL_SEC = 60 * 60 * 8; // 8 hours

export interface SessionPayload {
  staffUserId: string;
  email: string;
  acumaticaUserId: string;
  displayName: string | null;
  role: 'admin' | 'manager' | 'staff' | 'external_booker';
  homeBranchId: string | null;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 chars');
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(getSecretKey());
}

export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey(), {
      algorithms: ['HS256'],
    });
    return {
      staffUserId: payload.staffUserId,
      email: payload.email,
      acumaticaUserId: payload.acumaticaUserId,
      displayName: payload.displayName,
      role: payload.role,
      homeBranchId: payload.homeBranchId,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await encryptSession(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ACU_SESSION_COOKIE);
}

export async function setAcuSessionCookie(cookie: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACU_SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
}

export async function readAcuSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACU_SESSION_COOKIE)?.value ?? null;
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return decryptSession(jar.get(SESSION_COOKIE)?.value);
}
