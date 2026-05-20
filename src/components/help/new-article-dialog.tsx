'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createHelpArticle } from '@/app/(dashboard)/help/actions';

const CATEGORIES = [
  { value: 'getting_started', label: 'Getting started' },
  { value: 'daily_ops', label: 'Daily ops' },
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'master_data', label: 'Master data' },
  { value: 'troubleshooting', label: 'Troubleshooting' },
  { value: 'api_integration', label: 'API / integration' },
];

export function NewArticleDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('getting_started');
  const [content, setContent] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await createHelpArticle({ title, category, content_markdown: content });
      if (r.ok) { toast.success('Article published'); setOpen(false); setTitle(''); setContent(''); }
      else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus className="size-4" /> New Article</Button>} />
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader><DialogTitle className="font-bold">New Help Article</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Category</Label>
              <Select items={CATEGORIES} value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="font-semibold">Content *</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} required placeholder="Markdown supported" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Publish'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
