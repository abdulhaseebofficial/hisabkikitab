import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/format';

export default function Spinner({ size = 'md', className = '', label = 'Loading' }) {
  const dimensions = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <Loader2
      className={cn('animate-spin text-brand-600 dark:text-brand-400', dimensions, className)}
      role="status"
      aria-label={label}
    />
  );
}

/** Full-height centred spinner, for route-level suspense. */
export function PageSpinner({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner size="lg" label={label} />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
