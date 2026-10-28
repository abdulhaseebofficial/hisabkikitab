import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Link from '../../../shared/seo/PublicLink';
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Calculator,
  BookOpen,
  ChevronDown,
  Lock,
  Layers,
  Smartphone,
  Laptop,
} from 'lucide-react';
import PublicSiteLayout from '../../../app/layout/PublicSiteLayout';
import { templates, templateFaqs } from '../content/templatesData';
import { templatesMetadata } from '../metadata';
import { replacePageHead } from '../../../shared/seo/head';

function useTemplatesMetadata() {
  const location = useLocation();
  useEffect(() => {
    const origin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const page = templatesMetadata(location.pathname, origin);
    return replacePageHead(page, 'data-template-seo');
  }, [location.pathname]);
}

export function TemplatesContent() {
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="space-y-16 pb-12 sm:space-y-20 lg:space-y-24">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-slate-400">
        <ol className="flex items-center gap-2">
          <li>
            <Link to="/" className="hover:text-brand-600 hover:underline dark:hover:text-brand-400">Home</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-slate-900 dark:text-slate-100">Templates</li>
        </ol>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-brand-100/80 bg-gradient-to-b from-brand-50/60 via-canvas-card to-canvas-card p-6 shadow-sm sm:p-10 lg:p-14 dark:border-slate-800 dark:from-brand-950/20 dark:via-canvas-darkCard dark:to-canvas-darkCard">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Free Financial Planning Workbooks</span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-slate-100">
            Free Financial Planning &amp; Budget Templates
          </h1>

          <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
            Practical, offline Excel and Google Sheets spreadsheets tailored for everyday money, household living costs, and shared student flats in Pakistan.
          </p>

          {/* Trust Badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
              <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              100% Offline &amp; Private
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Zero Macros / 100% Safe
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              Pre-formatted for PKR (Rs)
            </span>
          </div>
        </div>
      </section>

      {/* Template Catalog Grid */}
      <section aria-labelledby="templates-catalog-heading">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="templates-catalog-heading" className="font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
              Featured Spreadsheet Templates
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Download clean, unbloated .xlsx workbooks ready to open in Microsoft Excel, Google Sheets, or LibreOffice.
            </p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            2 Free Templates Available
          </span>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {templates.map((template) => (
            <article
              key={template.slug}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-canvas-card p-6 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-canvas-darkCard sm:p-8"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                    {template.badge}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {template.fileSize} · {template.fileFormat.split(' ')[0]}
                  </span>
                </div>

                <h3 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
                  {template.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {template.description}
                </p>

                {/* Features List */}
                <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    What&apos;s Included:
                  </h4>
                  <ul className="mt-3 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                    {template.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actions & Cross-links */}
              <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <a
                    href={template.downloadUrl}
                    download={template.fileName}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                    aria-label={`Download ${template.title} in XLSX format (${template.fileSize})`}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Download Excel (.XLSX)</span>
                  </a>

                  <div className="flex items-center gap-3 text-xs">
                    <Link
                      to={template.relatedCalculator.path}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400"
                    >
                      <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Online Calculator</span>
                    </Link>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <Link
                      to={template.relatedGuide.path}
                      className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Guide</span>
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Interactive Sheet Preview Section */}
      <section aria-labelledby="preview-section-heading" className="rounded-3xl border border-slate-200 bg-slate-50/50 p-6 sm:p-10 dark:border-slate-800 dark:bg-slate-900/30">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>Interactive Sheet Structure</span>
          </div>
          <h2 id="preview-section-heading" className="mt-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
            Built for Pakistani Financial Life
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Every cell is designed with realistic Pakistani income and expense benchmarks, ensuring you don&apos;t have to re-engineer formulas or currency formats from scratch.
          </p>
        </div>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-canvas-darkCard">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0B1742] text-xs font-semibold text-white">
              <tr>
                <th scope="col" className="px-4 py-3">Expense Category</th>
                <th scope="col" className="px-4 py-3 text-right">Planned Limit (PKR)</th>
                <th scope="col" className="px-4 py-3 text-right">Actual Spent (PKR)</th>
                <th scope="col" className="px-4 py-3 text-right">Remaining Variance</th>
                <th scope="col" className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs sm:text-sm">
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-100">Rent / Housing</td>
                <td className="px-4 py-3 text-right">Rs 35,000</td>
                <td className="px-4 py-3 text-right">Rs 35,000</td>
                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">Rs 0</td>
                <td className="px-4 py-3 text-center"><span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">OK</span></td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-100">Groceries &amp; Supermarket</td>
                <td className="px-4 py-3 text-right">Rs 20,000</td>
                <td className="px-4 py-3 text-right">Rs 21,500</td>
                <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400">-Rs 1,500</td>
                <td className="px-4 py-3 text-center"><span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">OVER BUDGET</span></td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-100">Electricity, Gas &amp; Utilities</td>
                <td className="px-4 py-3 text-right">Rs 10,000</td>
                <td className="px-4 py-3 text-right">Rs 9,200</td>
                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">+Rs 800</td>
                <td className="px-4 py-3 text-center"><span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">OK</span></td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-slate-900 dark:text-slate-100">Fuel &amp; Commute</td>
                <td className="px-4 py-3 text-right">Rs 8,000</td>
                <td className="px-4 py-3 text-right">Rs 7,800</td>
                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">+Rs 200</td>
                <td className="px-4 py-3 text-center"><span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">OK</span></td>
              </tr>
              <tr className="bg-blue-50/50 font-bold dark:bg-blue-950/20">
                <td className="px-4 py-3 font-sans text-slate-900 dark:text-slate-100">Total Living Expenses</td>
                <td className="px-4 py-3 text-right">Rs 92,000</td>
                <td className="px-4 py-3 text-right">Rs 92,000</td>
                <td className="px-4 py-3 text-right text-slate-900 dark:text-slate-100">Rs 0</td>
                <td className="px-4 py-3 text-center"><span className="text-xs text-brand-700 dark:text-brand-300">BALANCED</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* How to Use in 3 Steps */}
      <section aria-labelledby="how-to-use-heading">
        <h2 id="how-to-use-heading" className="text-center font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
          How to Get Started in 3 Steps
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-canvas-card p-6 shadow-sm dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
              1
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Download the .XLSX
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Click download to save the unbloated spreadsheet file directly to your desktop computer, tablet, or phone.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-canvas-card p-6 shadow-sm dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
              2
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Customize Categories
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Open in Excel or Google Sheets. Adjust income amounts and expense category targets to reflect your household.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-canvas-card p-6 shadow-sm dark:border-slate-800 dark:bg-canvas-darkCard">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
              3
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Track Cash Flow
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Enter spending throughout the month. Pre-tested formulas calculate your remaining buffers and savings rates automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Privacy Guarantee Banner */}
      <section aria-labelledby="privacy-note-heading" className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-8 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 id="privacy-note-heading" className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Privacy &amp; Local Execution Guarantee
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              HisabKi Kitab does not require you to upload your financial figures to download or use these spreadsheets. All entries, salary figures, and expense items remain strictly on your personal device or chosen private cloud account. If you choose to upload a workbook to Google Sheets, that interaction takes place entirely within your personal Google account.
            </p>
          </div>
        </div>
      </section>

      {/* Web App Conversion Bridge */}
      <section aria-labelledby="app-cta-heading" className="rounded-3xl border border-brand-200 bg-gradient-to-r from-brand-600 to-brand-700 p-8 text-white shadow-lift sm:p-12 dark:border-brand-700">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ready for Mobile Automation?</span>
          </div>
          <h2 id="app-cta-heading" className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Want Automatic Sync Across Your Phone and Laptop?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-blue-50 sm:text-base">
            Spreadsheets are great for manual bookkeeping. But if you want automatic category summaries, WhatsApp debt settlement cards, and AI financial guidance on the go, try HisabKi Kitab online for free.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-600"
            >
              <span>Create Free Account</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/features"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <span>Explore Features</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions Accordion */}
      <section aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl">
          <h2 id="faq-heading" className="text-center font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-slate-100">
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
            Common questions about downloading, opening, and modifying HisabKi Kitab financial templates.
          </p>

          <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {templateFaqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className="py-4">
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${index}`}
                    className="flex w-full items-center justify-between text-left text-base font-semibold text-slate-900 transition hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-600' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div id={`faq-answer-${index}`} className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function TemplatesHubPage() {
  useTemplatesMetadata();
  return (
    <PublicSiteLayout>
      <TemplatesContent />
    </PublicSiteLayout>
  );
}
