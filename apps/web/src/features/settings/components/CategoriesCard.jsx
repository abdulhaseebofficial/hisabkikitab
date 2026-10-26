import { Plus, Tag, X } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import useT from '../../../shared/i18n/I18nProvider';
import useCategoryLabel from '../../../shared/i18n/useCategoryLabel';

/**
 * The built-in categories, plus whatever the student has added.
 *
 * A custom category can only be removed once no expense uses it; the API
 * refuses otherwise and says how many are in the way.
 */
export default function CategoriesCard({
  categories,
  custom,
  newCategory,
  onNewCategoryChange,
  onAdd,
  onRemove,
}) {
  const { t } = useT();
  const categoryLabel = useCategoryLabel();
  // `categories` is the active mode's full list, so the built-ins are whatever
  // is left once the person's own additions are taken out. It used to render a
  // static student list from the colour table, which meant a householder was
  // shown hostel categories they do not have and could not use.
  const builtIn = categories.filter((name) => !custom.includes(name));
  return (
    <Card>
      <CardHeader title="Categories" subtitle={t('settings.categoriesSubtitle')} icon={Tag} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {builtIn.map((name) => (
          <span
            key={name}
            dir="auto"
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {categoryLabel(name)}
          </span>
        ))}

        {custom.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
          >
            <span dir="auto">{name}</span>
            <button
              type="button"
              onClick={() => onRemove(name)}
              aria-label={`Remove ${name}`}
              className="rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={newCategory}
          onChange={(event) => onNewCategoryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAdd();
            }
          }}
          placeholder={t('settings.newCategoryPlaceholder')}
          aria-label={t('settings.newCategoryName')}
          className="hw-input flex-1"
        />
        <Button icon={Plus} onClick={onAdd} disabled={!newCategory.trim()}>
          Add
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {categories.length} categories available. A custom category can only be removed once no expense uses it.
      </p>
    </Card>
  );
}
