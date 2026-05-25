'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import { ChevronRight, ChevronDown, History } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { loadAuditLog, type AuditRow } from '@/app/(dashboard)/settings/audit-log/actions';

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  INSERT: 'default', UPDATE: 'secondary', DELETE: 'destructive',
};
// Auto/noise fields excluded from the diff display.
const NOISE = new Set(['updated_at', 'created_at']);
const ALL = '__all__';

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface Change { key: string; before: unknown; after: unknown }
function diffOf(row: AuditRow): Change[] {
  const b = row.before ?? {};
  const a = row.after ?? {};
  if (row.action === 'UPDATE') {
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !NOISE.has(k));
    return keys
      .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
      .map((k) => ({ key: k, before: b[k], after: a[k] }));
  }
  // INSERT shows the new row; DELETE shows the removed row.
  const src = row.action === 'INSERT' ? a : b;
  return Object.keys(src).filter((k) => !NOISE.has(k)).map((k) => ({ key: k, before: row.action === 'DELETE' ? src[k] : undefined, after: row.action === 'INSERT' ? src[k] : undefined }));
}

export function AuditLogExplorer({ initialRows, tables }: { initialRows: AuditRow[]; tables: readonly string[] }) {
  const [rows, setRows] = useState<AuditRow[]>(initialRows);
  const [table, setTable] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, startLoad] = useTransition();

  const [firstRun, setFirstRun] = useState(true);
  useEffect(() => {
    if (firstRun) { setFirstRun(false); return; }
    const t = setTimeout(() => {
      startLoad(async () => {
        setRows(await loadAuditLog({
          table: table === ALL ? undefined : table,
          action: action === ALL ? undefined : action,
          from: from || undefined,
          to: to || undefined,
        }));
        setExpanded(new Set());
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, action, from, to]);

  function toggle(id: number) {
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const tableOptions = [{ value: ALL, label: 'All tables' }, ...tables.map((t) => ({ value: t, label: t }))];
  const actionOptions = [{ value: ALL, label: 'All actions' }, ...['INSERT', 'UPDATE', 'DELETE'].map((a) => ({ value: a, label: a }))];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Table</Label>
            <Select items={tableOptions} value={table} onValueChange={(v) => v && setTable(v)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{tableOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">Action</Label>
            <Select items={actionOptions} value={action} onValueChange={(v) => v && setAction(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{actionOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <p className="ml-auto text-sm font-semibold text-muted-foreground">{loading ? 'Loading…' : `${rows.length} change${rows.length === 1 ? '' : 's'}`}</p>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 text-center">
            <History className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground mt-3">{loading ? 'Loading…' : 'No changes recorded for this filter.'}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-44 font-bold">When</TableHead>
                <TableHead className="w-40 font-bold">Who</TableHead>
                <TableHead className="w-52 font-bold">Table</TableHead>
                <TableHead className="w-28 font-bold">Action</TableHead>
                <TableHead className="font-bold">Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = expanded.has(r.id);
                const changes = isOpen ? diffOf(r) : [];
                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(r.id)}>
                      <TableCell className="text-muted-foreground">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                      <TableCell className="font-medium tabular text-muted-foreground">{fmtDateTime(r.changed_at)}</TableCell>
                      <TableCell className="font-semibold truncate">{r.actor ?? <span className="text-muted-foreground">system</span>}</TableCell>
                      <TableCell className="font-mono text-sm">{r.table_name}</TableCell>
                      <TableCell><Badge variant={ACTION_VARIANT[r.action] ?? 'secondary'} className="font-bold">{r.action}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate">{r.row_id ?? '—'}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={6} className="p-0">
                          {changes.length === 0 ? (
                            <p className="px-6 py-4 text-sm font-semibold text-muted-foreground">No field changes (only auto timestamps).</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-64 font-bold pl-6">Field</TableHead>
                                  <TableHead className="font-bold">{r.action === 'INSERT' ? 'Value' : 'Before'}</TableHead>
                                  {r.action === 'UPDATE' && <TableHead className="font-bold">After</TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {changes.map((c) => (
                                  <TableRow key={c.key}>
                                    <TableCell className="font-mono text-xs pl-6">{c.key}</TableCell>
                                    <TableCell className="text-sm tabular break-all">
                                      {r.action === 'INSERT' ? fmtVal(c.after) : fmtVal(c.before)}
                                    </TableCell>
                                    {r.action === 'UPDATE' && <TableCell className="text-sm tabular break-all font-semibold">{fmtVal(c.after)}</TableCell>}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
