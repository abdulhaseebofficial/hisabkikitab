import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import Link from '../../../shared/seo/PublicLink';
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  Wallet,
  PiggyBank,
  Users,
  HandCoins,
  FileSpreadsheet,
  Calculator,
  BookOpen,
} from 'lucide-react';
import PublicSiteLayout from '../../../app/layout/PublicSiteLayout';
import { features } from '../content/featuresData';
import { featureMetadata } from '../metadata';
import { trackEvent } from '../../../shared/analytics/analytics';
import { replacePageHead } from '../../../shared/seo/head';
import { canonicalPagePath, routePath } from '../../../shared/seo/urls';

const featureIcons = {
  'expense-tracker': Wallet,
  'monthly-budgeting': PiggyBank,
  'shared-living-roommates': Users,
  'lending-borrowing-khata': HandCoins,
};

function useFeatureMetadata(feature) {
  const location = useLocation();
  useEffect(() => {
    const origin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const page = featureMetadata(feature, location.pathname, origin);
    return replacePageHead(page, 'data-feature-seo');
  }, [location.pathname, feature?.slug]);
}

export function FeatureContent({ feature, isHub }) {
  if (isHub) {
    return <FeaturesHubContent />;
  }
  if (!feature) {
    return <FeatureNotFoundContent />;
  }
  return <FeatureDetailContent feature={feature} />;
}

function FeaturesHubContent() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 pb-16">
      <nav aria-label="Breadcrumbs" className="text-xs text-slate-500 dark:text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/" className="hover:underline">Home</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-medium text-slate-800 dark:text-slate-200" aria-current="page">Features</li>
        </ol>
      </nav>

      <header className="space-y-4 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Core Capabilities Built for Pakistan</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-slate-100">
          Smart Financial Tools for Everyday Life in Pakistan
        </h1>
        <p className="max-w-3xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
          Explore HisabKi Kitab’s integrated platform: personal income and expense tracking, monthly category budgeting, shared roommate costs, and personal khata records — fully optimized for Pakistani Rupees (PKR) and local living realities.
        </p>
      </header>

      {/* Feature Cards Grid */}
      <section aria-label="Available product features" className="grid gap-6 sm:grid-cols-2">
        {features.map((item) => {
          const Icon = featureIcons[item.slug] || Wallet;
          return (
            <div
              key={item.slug}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-canvas-card p-6 shadow-sm transition hover:border-brand-400 hover:shadow-md dark:border-slate-800 dark:bg-canvas-darkCard"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {item.tagline}
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  {item.capabilities.slice(0, 3).map((cap, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                      <span>{cap.title}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <Link
                  to={`/features/${item.slug}/`}
                  className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  <span>Explore {item.navLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          );
        })}
      </section>

      {/* Why Choose HisabKi Kitab in Pakistan */}
      <section aria-label="Built for Pakistan benefits" className="rounded-2xl border border-brand-100 bg-brand-50/50 p-6 sm:p-8 dark:border-brand-900/50 dark:bg-brand-950/20">
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Why Pakistani Households and Professionals Rely on HisabKi Kitab
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 font-bold">
              PKR
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Optimized for PKR</h3>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              Native Pakistani Rupee currency support, local budgeting benchmarks, and common Pakistani household spending categories.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 font-bold">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Privacy First & Bank-Free</h3>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              No bank account login, card details, or sensitive financial credentials required. You maintain complete ownership of your personal records.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 font-bold">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Personal & Shared Spaces</h3>
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              Keep personal expenses private while collaborating with flatmates, batchmates, or business partners in isolated workspaces.
            </p>
          </div>
        </div>
      </section>

      {/* Free Interactive Tools & Guides Section */}
      <section aria-label="Free tools and educational guides" className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-canvas-card p-6 dark:border-slate-800 dark:bg-canvas-darkCard">
          <div className="flex items-center gap-3">
            <Calculator className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Free Financial Calculators</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Model your finances with 7 interactive calculators: budget planning, savings goals, debt repayments, expense splitting, and net worth.
          </p>
          <div className="mt-4">
            <Link to="/tools/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Browse All Calculators <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-canvas-card p-6 dark:border-slate-800 dark:bg-canvas-darkCard">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Financial Education Guides</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Learn proven money management principles: budgeting techniques, managing informal debts, roommate cost sharing, and building emergency funds.
          </p>
          <div className="mt-4">
            <Link to="/learn/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Read Educational Guides <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Primary Registration Call to Action */}
      <section aria-label="Sign up call to action" className="rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-600 to-brand-700 p-8 text-center text-white shadow-lg sm:p-12 dark:border-brand-500/30">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">
          Start Managing Your Money with Confidence
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-brand-100 sm:text-base">
          Join thousands of students, families, and professionals across Pakistan who track spending and maintain financial clarity with HisabKi Kitab.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link
            to="/register/"
            onClick={() => trackEvent('core_feature_cta_clicked', { feature_name: 'features-hub' })}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold text-brand-700 shadow-md transition hover:bg-brand-50"
          >
            Create Your Free Account
          </Link>
          <Link
            to="/login/"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Sign In
          </Link>
        </div>
        <p className="mt-4 text-xs text-brand-200">
          100% free for personal use · No bank account connection required
        </p>
      </section>
    </div>
  );
}

function FeatureDetailContent({ feature }) {
  const Icon = featureIcons[feature.slug] || Wallet;

  return (
    <article className="mx-auto max-w-4xl space-y-12 pb-16">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumbs" className="text-xs text-slate-500 dark:text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/" className="hover:underline">Home</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/features/" className="hover:underline">Features</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="font-medium text-slate-800 dark:text-slate-200" aria-current="page">
            {feature.title}
          </li>
        </ol>
      </nav>

      {/* Hero Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          <span className="inline-flex items-center rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
            {feature.navLabel}
          </span>
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-slate-100">
          {feature.h1}
        </h1>
        <p className="text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
          {feature.tagline}
        </p>
        <div className="pt-2">
          <Link
            to="/register/"
            onClick={() => trackEvent('core_feature_cta_clicked', { feature_name: feature.slug })}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            <span>{feature.heroCta}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Problem & Solution Narrative */}
      <section aria-labelledby="problem-heading" className="rounded-2xl border border-slate-200 bg-canvas-card p-6 sm:p-8 dark:border-slate-800 dark:bg-canvas-darkCard">
        <h2 id="problem-heading" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          {feature.problem.heading}
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
          {feature.problem.paragraphs.map((para, index) => (
            <p key={index}>{para}</p>
          ))}
        </div>
      </section>

      {/* Core Capabilities */}
      <section aria-labelledby="capabilities-heading" className="space-y-6">
        <h2 id="capabilities-heading" className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
          Key Capabilities Built for Everyday Pakistani Realities
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {feature.capabilities.map((cap, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-canvas-card p-5 dark:border-slate-800 dark:bg-canvas-darkCard"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{cap.title}</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {cap.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow Steps */}
      <section aria-labelledby="workflow-heading" className="rounded-2xl border border-brand-100 bg-brand-50/40 p-6 sm:p-8 dark:border-brand-900/40 dark:bg-brand-950/20">
        <h2 id="workflow-heading" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          How It Works in 3 Simple Steps
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {feature.workflow.map((step) => (
            <div key={step.step} className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white dark:bg-brand-500">
                {step.step}
              </span>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
              <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Realistic Pakistan Worked Example */}
      <section aria-labelledby="example-heading" className="rounded-2xl border border-slate-200 bg-canvas-card p-6 sm:p-8 dark:border-slate-800 dark:bg-canvas-darkCard">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 id="example-heading" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            {feature.workedExample.heading}
          </h2>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {feature.workedExample.intro}
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Description</th>
                <th scope="col" className="px-4 py-3 font-semibold">Amount (PKR)</th>
                <th scope="col" className="px-4 py-3 font-semibold">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {feature.workedExample.items.map(([desc, amt, cls], idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200 font-medium">{desc}</td>
                  <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100 font-semibold">{amt}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{cls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-medium text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          {feature.workedExample.summary}
        </div>
      </section>

      {/* Connected Calculator & Guide Matrix */}
      <section aria-labelledby="connected-tools-heading" className="space-y-4">
        <h2 id="connected-tools-heading" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Connected Calculators & Educational Guides
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {feature.relatedCalculator && (
            <div className="rounded-xl border border-slate-200 bg-canvas-card p-5 dark:border-slate-800 dark:bg-canvas-darkCard">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Interactive Calculator
              </span>
              <h3 className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {feature.relatedCalculator.title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {feature.relatedCalculator.description}
              </p>
              <div className="mt-4">
                <Link
                  to={feature.relatedCalculator.path}
                  className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                >
                  Open Free Calculator <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}

          {feature.relatedGuide && (
            <div className="rounded-xl border border-slate-200 bg-canvas-card p-5 dark:border-slate-800 dark:bg-canvas-darkCard">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Educational Guide
              </span>
              <h3 className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                {feature.relatedGuide.title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {feature.relatedGuide.description}
              </p>
              <div className="mt-4">
                <Link
                  to={feature.relatedGuide.path}
                  className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                >
                  Read Practical Guide <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section aria-labelledby="faqs-heading" className="space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 id="faqs-heading" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Frequently Asked Questions
          </h2>
        </div>
        <div className="space-y-3">
          {feature.faqs.map((faq, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-canvas-card p-5 dark:border-slate-800 dark:bg-canvas-darkCard"
            >
              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {faq.question}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-600 dark:text-slate-300">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Registration Call to Action */}
      <section aria-label="Register for free" className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-600 to-brand-700 p-8 text-center text-white shadow-md sm:p-10 dark:border-brand-600/30">
        <h2 className="font-display text-2xl font-bold">
          Start Using {feature.title} Today
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-brand-100 sm:text-sm">
          Keep your money organized with zero bank credentials, complete privacy, and native PKR currency support.
        </p>
        <div className="mt-6">
          <Link
            to="/register/"
            onClick={() => trackEvent('core_feature_cta_clicked', { feature_name: feature.slug })}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold text-brand-700 shadow transition hover:bg-brand-50"
          >
            Create Free Account
          </Link>
        </div>
        <div className="mt-4">
          <Link to="/features/" className="inline-flex min-h-11 items-center text-xs text-brand-200 hover:text-white underline">
            ← Explore other features
          </Link>
        </div>
      </section>
    </article>
  );
}

function FeatureNotFoundContent() {
  return (
    <div className="mx-auto max-w-md text-center py-16 space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
        Feature Not Found
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The requested feature page is unavailable or has moved. Explore our core features below.
      </p>
      <div>
        <Link
          to="/features/"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          View All Features
        </Link>
      </div>
    </div>
  );
}

export default function FeaturePage() {
  const { feature: slug } = useParams();
  const location = useLocation();
  const isHub = routePath(location.pathname) === '/features';
  const feature = isHub ? null : features.find((item) => item.slug === slug);

  useFeatureMetadata(feature);

  return (
    <PublicSiteLayout>
      <FeatureContent feature={feature} isHub={isHub} />
    </PublicSiteLayout>
  );
}
