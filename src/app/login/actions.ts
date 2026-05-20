'use server';

import { z } from 'zod';

import { verifyCredentials } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter a valid email and password' };
  const session = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!session) return { ok: false, error: 'Invalid email or password' };
  await setSessionCookie(session);
  return { ok: true };
}
