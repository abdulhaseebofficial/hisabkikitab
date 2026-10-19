import { Link } from 'react-router-dom';
import { cn } from '../../utils/format';
import OfficialLogo from './OfficialLogo';

/**
 * The official mark and wordmark shared by app navigation and auth screens.
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
      <OfficialLogo className="h-10 w-10" />

      {showName && (
        <span
          className={cn(
          'font-display text-xl font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-slate-900 dark:text-slate-100',
            nameClassName
          )}
        >
          HisabKi <span className={inverted ? '' : 'text-brand-600 dark:text-brand-400'}>Kitab</span>
        </span>
      )}
    </Link>
  );
}
