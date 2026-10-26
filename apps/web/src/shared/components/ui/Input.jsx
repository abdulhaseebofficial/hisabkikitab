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

  /**
   * Which way the text in this field runs.
   *
   * `auto` lets the browser decide from the first strong character the person
   * types, so "گھر کا کرایہ" right-aligns and reads right-to-left while
   * "Dhaba lunch" stays left-to-right, in the same box, without the page
   * flipping around it.
   *
   * Only for the types a person writes prose into. A number, date, email or
   * password is a structured value: `auto` would start right-aligning an
   * amount the moment it began with an Urdu digit, and a currency column that
   * changes side per row is harder to read, not easier. An explicit `dir` from
   * the caller always wins.
   */
  const FREE_TEXT_TYPES = ['text', 'search', undefined];
  const direction = props.dir || (FREE_TEXT_TYPES.includes(props.type) ? 'auto' : undefined);

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
          dir={direction}
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
