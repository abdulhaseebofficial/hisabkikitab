import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { DEVELOPER } from '../../shared/utils/constants';

export default function TrustContent({ page }) {
  return (
    <article className="mx-auto w-full max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link className="hover:underline" to="/">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{page.title}</li>
        </ol>
      </nav>
      <header className="mb-8 border-b border-slate-200 pb-6 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300">Hisab Ki Kitab · Trust &amp; information</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">{page.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">{page.intro}</p>
        {page.lastUpdated && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Last updated: <time dateTime="2026-09-28">{page.lastUpdated}</time></p>}
      </header>

      <div className="space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-base">
        {page.sections.map((section) => (
          <section key={section.heading} aria-labelledby={`section-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <h2 id={`section-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100 sm:text-xl">{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-2">{paragraph}</p>)}
            {section.links?.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {section.links.map((link) => <li key={link.to}><Link className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200" to={link.to}>{link.label}</Link></li>)}
            </ul>}
            {section.externalLinks?.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {section.externalLinks.map((link) => <li key={link.href}><a className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200" href={link.href} target="_blank" rel="noreferrer noopener">{link.label}</a></li>)}
            </ul>}
          </section>
        ))}

        {page.showEmail && <div className="mt-5 rounded-2xl border border-slate-200 bg-canvas-card p-5 dark:border-slate-800 dark:bg-canvas-darkCard">
          <a className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500" href={`mailto:${DEVELOPER.email}?subject=Hisab%20Ki%20Kitab`}>
            <Mail className="h-4 w-4" aria-hidden="true" /> Email Hisab Ki Kitab
          </a>
          <p className="mt-3 break-all text-sm text-slate-600 dark:text-slate-300">{DEVELOPER.email}</p>
        </div>}
      </div>
    </article>
  );
}
