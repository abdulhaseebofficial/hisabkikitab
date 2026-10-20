import { forwardRef, useId } from 'react';
import { cn } from '../../utils/format';
import { allowOnlyNumbers } from '../../utils/inputs';

/**
 * Text/number/date input with a label, an optional prefix (currency symbol),
 * an optional suffix (a show-password toggle, a unit) and an error slot.
 * forwardRef so react-hook-form can register it.
 *
 * The suffix sits inside the same relative wrapper as the input, so it stays
 * centred on the field whatever the label, hint or error underneath is doing.
 */
const Input = forwardRef(function Input(
  { label, error, hint, prefix, suffix, className = '', id, onKeyDown, ...props },
  ref
) {
  // A label is only a label if it points at something. `id` and `name` are
  // both optional - a field driven by useState rather than react-hook-form has
  // neither - and without one the htmlFor below pointed at nothing, leaving the
  // field unlabelled for anyone using a screen reader.
  const generatedId = useId();
  const inputId = id || props.name || generatedId;

  const handleKeyDown = (e) => {
    if (props.type === 'number') {
      const isNegativeAllowed = props.min !== undefined && Number(props.min) < 0;
      const isDecimalAllowed = props.step !== '1';
      allowOnlyNumbers(e, { allowDecimal: isDecimalAllowed, allowNegative: isNegativeAllowed });
    }
    if (onKeyDown) onKeyDown(e);
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="hw-label">
          {label}
        </label>
      )}

      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'hw-input',
            prefix && 'pl-9',
            suffix && 'pr-10',
            error && 'border-danger focus:border-danger focus:ring-danger'
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onKeyDown={handleKeyDown}
          {...props}
        />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>

      {hint && !error && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && (
        <p id={`${inputId}-error`} className="hw-error">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
