import { cn } from '@/lib/utils';

/**
 * Currency context indicator. The POS surfaces no per-amount currency
 * symbol (₱) on the grid — this badge in the TopBar tells the reader the
 * unit once, and every "1,500" downstream means the same thing.
 *
 * Visual: primary-tinted pill with an emphasized code so it stands out next
 * to the muted icon buttons in the TopBar. `compact` drops the "Currency"
 * label for tight places (e.g. dialog headers).
 */
export function CurrencyBadge({
  code = 'PHP',
  compact = false,
  className,
}: {
  code?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border-2 border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] shrink-0 shadow-sm',
        className,
      )}
      title={`All amounts shown in ${code}`}
    >
      {!compact && <span className="text-primary/70">Currency</span>}
      {!compact && <span className="text-primary/40">·</span>}
      <span className="text-primary text-sm font-extrabold tracking-wider">{code}</span>
    </span>
  );
}
