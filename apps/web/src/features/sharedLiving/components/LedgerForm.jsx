import { useState } from "react";
import Button from "../../../shared/components/ui/Button";
import Input from "../../../shared/components/ui/Input";
import Select from "../../../shared/components/ui/Select";
import useT from "../../../shared/i18n/I18nProvider";

// Declarative field definitions use translation keys, including browser validation feedback.
export default function LedgerForm({
  fields,
  initial,
  onSubmit,
  busy,
  children,
}) {
  const { t } = useT();
  const [values, setValues] = useState(initial);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        onSubmit(values);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(
          ({ key, type = "text", options, required = false, uppercase = false, ...rest }) =>
            type === "checkbox" ? (
              <label
                key={key}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={!!values[key]}
                  onChange={(e) =>
                    setValues({ ...values, [key]: e.target.checked })
                  }
                />
                {t(`shared.${key}`)}
              </label>
            ) : options ? (
              <Select
                key={key}
                label={t(`shared.${key}`)}
                options={options}
                required={required}
                onInvalid={(e) => e.target.setCustomValidity(t('shared.invalid'))}
                onInput={(e) => e.target.setCustomValidity('')}
                value={values[key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [key]: uppercase ? e.target.value.toUpperCase() : e.target.value })
                }
              />
            ) : (
              <Input
                key={key}
                label={t(`shared.${key}`)}
                type={type}
                required={required}
                maxLength={type === "text" ? 1000 : undefined}
                {...rest}
                value={values[key] ?? ""}
                onInvalid={(e) =>
                  e.target.setCustomValidity(t("shared.invalid"))
                }
                onInput={(e) => e.target.setCustomValidity("")}
                onChange={(e) =>
                  setValues({ ...values, [key]: uppercase ? e.target.value.toUpperCase() : e.target.value })
                }
              />
            ),
        )}
      </div>
      {children?.(values, setValues)}
      <Button type="submit" disabled={busy}>
        {t("shared.save")}
      </Button>
    </form>
  );
}
