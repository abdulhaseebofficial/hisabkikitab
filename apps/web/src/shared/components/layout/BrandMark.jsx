import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { cn } from '../../utils/format';

/**
 * The Hisabki Kitab logo: the wallet tile plus the wordmark.
 *
 * It appeared three times with three slightly different tile sizes and colour
 * treatments - which is how a logo stops being a logo. `inverted` is the
 * version for the terracotta panel on the auth screens, where the tile is a
 * translucent white instead of solid brand.
 */
export default function BrandMark({
  to = '/dashboard',
  inverted = false,
  showName = true,
  nameClassName = '',
  className = '',
}) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          inverted ? 'bg-white/15 text-white' : 'bg-brand-600 text-white'
        )}
      >
        <Wallet className="h-5 w-5" aria-hidden="true" />
      </span>

      {showName && (
        <span
          className={cn(
          'font-display text-xl font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-slate-900 dark:text-slate-100',
            nameClassName
          )}
        >
          Hisabki <span className={inverted ? '' : 'text-brand-600 dark:text-brand-400'}>Kitab</span>
        </span>
      )}
    </Link>
  );
}
