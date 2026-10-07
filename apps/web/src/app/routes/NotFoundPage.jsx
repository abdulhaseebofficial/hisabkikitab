import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import Button from '../../shared/components/ui/Button';
import useT from '../../shared/i18n/I18nProvider';

export default function NotFound() {
  const { t } = useT();
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-500/10">
        <Compass className="h-8 w-8 text-brand-600 dark:text-brand-400" />
      </span>

      <p className="text-5xl font-extrabold text-slate-900 dark:text-slate-100">404</p>
      <h1 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">{t('app.pageNotFound')}</h1>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">The link may be old, or the page may have moved.</p>

      <Link to="/dashboard" className="mt-6">
        <Button icon={Home} size="lg">
          Back to dashboard
        </Button>
      </Link>
      <nav aria-label="Helpful public pages" className="mt-5 flex flex-wrap justify-center gap-5 text-sm">
        <Link to="/" className="min-h-11 content-center text-brand-700 underline dark:text-brand-300">Home</Link>
        <Link to="/learn" className="min-h-11 content-center text-brand-700 underline dark:text-brand-300">Financial guides</Link>
        <Link to="/tools" className="min-h-11 content-center text-brand-700 underline dark:text-brand-300">Calculators</Link>
      </nav>
    </div>
  );
}
