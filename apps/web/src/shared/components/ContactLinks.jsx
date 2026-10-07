import { Linkedin, Mail } from 'lucide-react';
import { DEVELOPER } from '../utils/constants';
import { cn } from '../utils/format';

/**
 * How to reach the developer directly.
 *
 * The footer and the feedback dialog both offer this, and both were building
 * the same mailto URL and the same `rel="noreferrer noopener"` by hand. The
 * two places want different chrome, not different links, so the variant is a
 * prop and the addresses live in one place.
 */
export default function ContactLinks({ variant = 'inline', showEmailAddress = false, className = '' }) {
  const styles =
    variant === 'button'
      ? 'inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-200 dark:hover:text-brand-300'
      : 'inline-flex items-center gap-1.5 transition hover:text-brand-600 dark:hover:text-brand-400';

  return (
    <>
      <a href={DEVELOPER.linkedin} target="_blank" rel="noreferrer noopener" className={cn(styles, className)}>
        <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
        LinkedIn
      </a>

      <a href={`mailto:${DEVELOPER.email}?subject=Hisabki Kitab`} className={cn(styles, className)}>
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        {showEmailAddress ? DEVELOPER.email : 'Email'}
      </a>
    </>
  );
}
