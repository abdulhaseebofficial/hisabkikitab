import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/format';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-card hover:bg-brand-700 focus-visible:ring-brand-500 disabled:bg-brand-800 disabled:hover:bg-brand-800',
  secondary:
    'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  outline:
    'border border-slate-300 bg-canvas-card text-slate-700 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-danger text-white shadow-card hover:bg-[#8f1e18] focus-visible:ring-danger disabled:hover:bg-danger',
  success: 'bg-safe text-white shadow-card hover:bg-[#25633f] focus-visible:ring-safe disabled:hover:bg-safe',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2',
  icon: 'p-2',
};

/**
 * How the shortcut badge is tinted for each variant.
 *
 * A <kbd> sitting on a solid brand button needs to read as a key without
 * fighting the label, so on filled variants it borrows the button's own
 * foreground at low opacity rather than introducing a colour. On the quiet
 * variants it uses the surface tokens the rest of the app uses for keys.
 */
const SHORTCUT_TONES = {
  primary: 'border-white/30 bg-white/15 text-white',
  danger: 'border-white/30 bg-white/15 text-white',
  success: 'border-white/30 bg-white/15 text-white',
  secondary: 'border-slate-300 bg-white/70 text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300',
  outline: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ghost: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/**
 * The one button in the app. `loading` disables it and swaps the leading icon
 * for a spinner so the label never shifts.
 *
 * `shortcut` puts a key badge at the trailing edge - "Add expense    N" - for
 * actions that also answer to the keyboard. It is hidden below sm, because a
 * phone has no key to press and the badge would only be noise. The button's
 * accessible name still mentions it, so it is announced rather than only seen.
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  shortcut,
  className = '',
  type = 'button',
  disabled,
  title,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      title={title || (shortcut ? `Shortcut: press ${shortcut}` : undefined)}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true" />
      )}
      {children}
      {shortcut && (
        <>
          <kbd
            aria-hidden="true"
            className={cn(
              'ml-1.5 hidden rounded border px-1.5 py-0.5 font-sans text-[11px] font-semibold leading-none sm:inline-block',
              SHORTCUT_TONES[variant] || SHORTCUT_TONES.outline
            )}
          >
            {shortcut}
          </kbd>
          {/* The badge is decorative to a screen reader; this is the part it reads. */}
          <span className="sr-only"> (keyboard shortcut: {shortcut})</span>
        </>
      )}
    </button>
  );
}
