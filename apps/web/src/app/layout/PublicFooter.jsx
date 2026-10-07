import { Link } from 'react-router-dom';
import TrustFooterLinks from './TrustFooterLinks';

export default function PublicFooter() {
  return (
    <footer className="mt-4 border-t border-slate-200 py-8 text-sm text-slate-600 sm:py-10 dark:border-slate-800 dark:text-slate-400">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-sm">
          <Link to="/" className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">Hisab Ki Kitab</Link>
          <p className="mt-2 leading-6">A calmer way to manage personal, household and shared money.</p>
        </div>
        <TrustFooterLinks />
      </div>
    </footer>
  );
}
