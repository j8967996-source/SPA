import { createServiceClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { ShiftControls } from '@/components/shift-schedule/shift-controls';
import { ShiftCell, type ShiftData } from '@/components/shift-schedule/shift-cell';

export const dynamic = 'force-dynamic';

function thisMonday(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  now.setDate(now.getDate() - day);
  return now.toISOString().slice(0, 10);
}

function weekDays(monday: string): { date: string; label: string; dow: string }[] {
  const out: { date: string; label: string; dow: string }[] = [];
  const base = new Date(`${monday}T00:00:00`);
  const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, label: iso.slice(5), dow: dows[i] });
  }
  return out;
}

async function fetchData(branchParam?: string, weekParam?: string) {
  const supabase = createServiceClient();
  const { data: branches } = await supabase
    .from('branches').select('id, code, name').eq('active', true).order('code');
  const list = branches ?? [];
  const branchId = branchParam && list.some((b) => b.id === branchParam) ? branchParam : list[0]?.id;
  const monday = weekParam ?? thisMonday();
  const days = weekDays(monday);

  let employees: { id: string; employee_code: string; name: string }[] = [];
  let shifts: { employee_id: string; shift_date: string; shift_type: string; shift_start: string | null; shift_end: string | null; leave_type: string | null }[] = [];
  if (branchId) {
    const [emp, sh] = await Promise.all([
      supabase.from('employees').select('id, employee_code, name').eq('home_branch_id', branchId).eq('status', 'active').order('employee_code'),
      supabase.from('employee_shifts')
        .select('employee_id, shift_date, shift_type, shift_start, shift_end, leave_type')
        .eq('branch_id', branchId)
        .gte('shift_date', days[0].date)
        .lte('shift_date', days[6].date),
    ]);
    employees = emp.data ?? [];
    shifts = sh.data ?? [];
  }

  return { branches: list, branchId, monday, days, employees, shifts };
}

export default async function ShiftSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const { branches, branchId, monday, days, employees, shifts } = await fetchData(sp.branch, sp.week);

  const shiftAt = (empId: string, date: string): ShiftData | null => {
    const s = shifts.find((x) => x.employee_id === empId && x.shift_date === date);
    return s ? { shift_type: s.shift_type, shift_start: s.shift_start, shift_end: s.shift_end, leave_type: s.leave_type } : null;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Shift Schedule</h2>
          <p className="text-sm font-semibold text-muted-foreground mt-1">
            Week of {monday} · home-branch therapists · click a cell to set a shift
          </p>
        </div>
        {branchId && <ShiftControls branches={branches} branchId={branchId} weekStart={monday} />}
      </div>

      {!branchId ? (
        <Card className="border-dashed bg-muted/30 p-8 text-center text-sm font-semibold text-muted-foreground">
          Create a branch first.
        </Card>
      ) : employees.length === 0 ? (
        <Card className="border-dashed bg-muted/30 p-8 text-center text-sm font-semibold text-muted-foreground">
          No active employees with this branch as their home branch.
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-bold text-sm p-3 w-48 sticky left-0 bg-card">Therapist</th>
                {days.map((d) => (
                  <th key={d.date} className="text-center font-bold text-xs p-2 min-w-[88px]">
                    <div>{d.dow}</div>
                    <div className="font-medium text-muted-foreground tabular">{d.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="p-3 sticky left-0 bg-card">
                    <div className="font-semibold text-sm">{e.name}</div>
                    <div className="font-mono font-bold text-xs text-muted-foreground">{e.employee_code}</div>
                  </td>
                  {days.map((d) => (
                    <td key={d.date} className="p-1 align-middle">
                      <ShiftCell
                        employeeId={e.id}
                        employeeName={e.name}
                        branchId={branchId}
                        date={d.date}
                        shift={shiftAt(e.id, d.date)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded bg-primary/15" /> Regular</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded bg-amber-500/15" /> Cross-branch</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded bg-blue-500/15" /> On-call</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded bg-muted" /> Off</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded bg-destructive/15" /> Leave</span>
      </div>
    </div>
  );
}
