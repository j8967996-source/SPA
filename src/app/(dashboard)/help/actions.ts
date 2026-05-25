'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createAuditedClient } from '@/lib/supabase/server';
import { currentSession, isAdmin } from '@/lib/auth';

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  title: z.string().min(1).max(160),
  category: z.enum(['getting_started', 'daily_ops', 'reconciliation', 'master_data', 'troubleshooting', 'api_integration']),
  content_markdown: z.string().min(1).max(20000),
});

function slugify(t: string): string {
  return t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `article-${Date.now()}`;
}

export async function createHelpArticle(input: unknown): Promise<ActionResult> {
  const session = await currentSession();
  if (!isAdmin(session)) return { ok: false, error: 'Admin permission required' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  const supabase = await createAuditedClient();
  const { error } = await supabase.from('help_articles').insert({
    title: d.title,
    slug: `${slugify(d.title)}-${Math.random().toString(36).slice(2, 6)}`,
    category: d.category,
    content_markdown: d.content_markdown,
    is_published: true,
    order_index: 0,
    updated_by_staff_id: session!.staffUserId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/help');
  return { ok: true };
}
