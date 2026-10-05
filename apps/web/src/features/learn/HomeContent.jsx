import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChartNoAxesCombined, HandCoins, House, PieChart, Receipt, Sparkles, Target, Users, Wallet } from 'lucide-react';
import { articles } from './content';

const features = [
  { title: 'Dashboard', description: 'See the whole picture before you make the next decision.', to: '/dashboard', icon: ChartNoAxesCombined },
  { title: 'Expenses & income', description: 'Keep everyday cash flow clear and easy to review.', to: '/expenses', icon: Receipt },
  { title: 'Budgets', description: 'Give your monthly spending a practical plan.', to: '/budget', icon: PieChart },
  { title: 'Savings goals', description: 'Turn an intention into progress you can follow.', to: '/goals', icon: Target },
  { title: 'Lending & borrowing', description: 'Keep a record of money you owe or are owed.', to: '/debts', icon: HandCoins },
  { title: 'Reports & AI Advisor', description: 'Understand patterns and get useful guidance.', to: '/reports', icon: Sparkles },
];

const modes = [
  { title: 'Individual', description: 'Your income, spending and goals.', icon: Wallet },
  { title: 'Household', description: 'Regular costs and plans for home.', icon: House },
  { title: 'Shared living', description: 'Expenses and contributions together.', icon: Users },
];

export default function HomeContent({ ArticleCard }) {
  return (
    <>
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-brand-200/70 bg-[#f7eee7] px-5 py-14 text-center sm:px-10 sm:py-20 lg:py-24 dark:border-brand-500/20 dark:bg-[#29221e]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl dark:bg-brand-500/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-20 h-80 w-80 rounded-full bg-white/70 blur-3xl dark:bg-brand-700/10" />
        <div className="relative mx-auto max-w-4xl">
          <p className="mb-6 inline-flex items-center rounded-full border border-brand-200 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand-700 dark:border-brand-500/25 dark:bg-white/5 dark:text-brand-300">Personal & shared financial management</p>
          <h1 className="font-display text-[clamp(2.65rem,7vw,5.5rem)] font-semibold leading-[1.06] tracking-[-0.04em] text-slate-900 dark:text-slate-100">Make sense of your money.<br /><span className="text-brand-600 dark:text-brand-400">Make room for more.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8 dark:text-slate-300">Hisabki Kitab brings expenses, income, budgets, goals and shared costs into one calm place. See where you stand and plan what comes next.</p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-sm font-semibold text-white shadow-brand transition hover:bg-brand-700">Start managing your money <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link to="/login" className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand-300/70 bg-white/70 px-7 text-sm font-semibold text-slate-800 transition hover:bg-white dark:border-slate-700 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10">Sign in</Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-400"><span>Individual</span><span aria-hidden="true" className="text-brand-400">✦</span><span>Household</span><span aria-hidden="true" className="text-brand-400">✦</span><span>Shared living</span></div>
        </div>
      </section>

      <section className="py-16 sm:py-20" aria-labelledby="modes-heading">
        <div className="mb-8 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-700 dark:text-brand-300">Built for real life</p><h2 id="modes-heading" className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">A clearer view, however you manage money.</h2><p className="mt-4 leading-7 text-slate-600 dark:text-slate-400">Keep a personal plan, organize household costs, or track shared spending with the people you live with.</p></div>
        <div className="grid gap-4 md:grid-cols-3">{modes.map(({ title, description, icon: Icon }) => <div key={title} className="rounded-[1.5rem] border border-slate-200 bg-canvas-card p-6 dark:border-slate-800 dark:bg-canvas-darkCard"><span className="mb-7 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Icon className="h-5 w-5" aria-hidden="true" /></span><h3 className="font-display text-2xl font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p></div>)}</div>
      </section>

      <section id="features" className="rounded-[2rem] border border-slate-200 bg-canvas-card p-5 sm:p-10 dark:border-slate-800 dark:bg-canvas-darkCard" aria-labelledby="features-heading">
        <div className="mb-8 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-700 dark:text-brand-300">Your financial workspace</p><h2 id="features-heading" className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">Everything you need to stay on top of your money.</h2></div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-700 dark:bg-slate-700">{features.map(({ title, description, to, icon: Icon }) => <Link key={title} to={to} className="group flex min-w-0 flex-col bg-canvas-card p-5 transition-colors hover:bg-brand-50 sm:p-6 dark:bg-canvas-darkCard dark:hover:bg-brand-500/10"><Icon className="mb-6 h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" /><h3 className="text-base font-semibold">{title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p><span className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">Open feature <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span></Link>)}</div>
      </section>

      <section className="py-16 sm:py-20" aria-labelledby="guides-heading">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="max-w-2xl"><p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand-700 dark:text-brand-300"><BookOpen className="h-4 w-4" aria-hidden="true" /> Supporting resources</p><h2 id="guides-heading" className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Understand the numbers behind your plan.</h2><p className="mt-3 leading-7 text-slate-600 dark:text-slate-400">Practical guides make saving, budgeting and shared costs easier to put into practice.</p></div><Link to="/learn" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Explore all guides <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
        <div className="grid gap-5 md:grid-cols-3">{articles.filter((article) => article.featured).slice(0, 3).map((article) => <ArticleCard key={article.slug} article={article} />)}</div>
        <Link to="/tools" className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Browse financial calculators <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </section>
    </>
  );
}
