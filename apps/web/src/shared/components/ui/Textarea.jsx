import { forwardRef, useId } from 'react';
import { cn } from '../../utils/format';

const Textarea = forwardRef(function Textarea({ label, error, hint, className = '', id, rows = 3, ...props }, ref) {
  // See Input.jsx: without a fallback the label points at nothing.
  const generatedId = useId();
  const textareaId = id || props.name || generatedId;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={textareaId} className="hw-label">
          {label}
        </label>
      )}
      {/*
        A textarea is always prose, so direction follows the text itself: an
        Urdu note right-aligns and reads right-to-left, an English one does
        not, and neither disturbs the page around it. A caller that needs a
        fixed direction can still pass `dir`.
      */}
      <textarea
        id={textareaId}
        ref={ref}
        rows={rows}
        className={cn('hw-input resize-none', error && 'border-danger focus:border-danger focus:ring-danger')}
        aria-invalid={Boolean(error)}
        dir="auto"
        {...props}
      />
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p className="hw-error">{error}</p>}
    </div>
  );
});

export default Textarea;
