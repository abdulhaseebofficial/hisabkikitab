import { Link } from 'react-router-dom';
import OfficialLogo from './OfficialLogo';
import { cn } from '../../utils/format';

/** The official mark and consistently spelled product wordmark. */
export default function BrandMark({
  to = '/dashboard',
  inverted = false,
  showName = true,
  nameClassName = '',
  className = '',
}) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5', className)} aria-label={showName ? undefined : 'HisabKi Kitab'}>
      <OfficialLogo className="h-10 w-10" />
      {showName && (
        <span className={cn('font-display text-xl font-semibold tracking-tight', inverted ? 'text-white' : 'text-slate-900 dark:text-slate-100', nameClassName)}>
          HisabKi <span className={inverted ? 'text-white' : 'text-brand-600 dark:text-brand-300'}>Kitab</span>
        </span>
      )}
    </Link>
  );
}
