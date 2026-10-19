import { useEffect, useRef, useState } from 'react';
import Link from '../../shared/seo/PublicLink';
import { useLocation } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, Check, House,
  Plus, Target, Users, Wallet
} from 'lucide-react';
import OfficialLogo from '../../shared/components/layout/OfficialLogo';
import { articles } from './content';
import './home.css';

const previews = [
  {
    id: 'individual', title: 'Individual', icon: Wallet,
    description: 'Track personal income, expenses, budgets, and savings.',
    balance: '84,500', income: '120,000', expenses: '35,500', goal: '68%',
    transactions: [['Salary', '+120,000', 'income'], ['Groceries', '-8,200', 'expense']],
    bars: [43, 58, 48, 76, 62, 85, 69],
  },
  {
    id: 'household', title: 'Household', icon: House,
    description: 'Plan family costs, regular bills, and shared budgets.',
    balance: '148,400', income: '225,000', expenses: '76,600', goal: '54%',
    transactions: [['Household income', '+225,000', 'income'], ['Utilities', '-18,400', 'expense']],
    bars: [53, 42, 70, 61, 78, 55, 84],
  },
  {
    id: 'shared', title: 'Shared Living', icon: Users,
    description: 'See shared bills, contributions, and settlements.',
    balance: '32,750', income: '60,000', expenses: '27,250', goal: '72%',
    transactions: [['Contributions', '+60,000', 'income'], ['Shared groceries', '-6,750', 'expense']],
    bars: [36, 54, 49, 72, 63, 87, 75],
  },
];

const featureCards = [
  {
    title: 'Individual Finance', icon: Wallet,
    description: 'Make everyday money easier to understand, from payday to your next goal.',
    points: ['Income and expense tracking', 'Personal budgets', 'Savings goals', 'Financial overview'],
    to: '/dashboard', action: 'Open your finances'
  },
  {
    title: 'Household Finance', icon: House,
    description: 'Keep a clear view of family spending and the bills that shape each month.',
    points: ['Household income and costs', 'Recurring bills', 'Budget planning', 'Shared savings goals'],
    to: '/dashboard', action: 'Explore household view'
  },
  {
    title: 'Shared Living', icon: Users,
    description: 'Stay on top of the costs you manage together in a shared space.',
    points: ['Shared expenses', 'Member contributions', 'Pending balances', 'Settlement records'],
    to: '/dashboard', action: 'Explore shared view'
  },
];

function FinancePhone({ preview, demoPreview }) {
  return (
    <div className="hkk-phone" aria-label={`${preview.title} sample finance preview`}>
      <div className="hkk-phone-notch" aria-hidden="true">
        <span className="hkk-phone-speaker" />
        <span className="hkk-phone-camera" />
      </div>
      <div className="hkk-phone-screen" key={preview.id}>
        <div className="hkk-phone-status"><span>9:41</span><span aria-hidden="true">●●● ▰</span></div>
        <div className="hkk-phone-top">
          <div className="flex items-center gap-2"><OfficialLogo className="h-8 w-8" /><span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">HisabKi Kitab</span></div>
          <span className="hkk-phone-avatar" aria-hidden="true">HK</span>
        </div>
        <p className="hkk-phone-overview text-xs font-medium text-slate-500 dark:text-slate-400">{preview.title} overview</p>
        <div className="hkk-phone-balance">
          <span className="text-[11px] font-medium text-white/80">Available balance</span>
          <strong className="mt-1 block text-[24px] leading-tight tracking-tight">Rs {preview.balance}</strong>
          <span className="mt-1 block text-[10px] text-white/75">Illustrative PKR figures</span>
        </div>
        <div className="hkk-phone-summary">
          <div><ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /><span>Income</span><strong>Rs {preview.income}</strong></div>
          <div><ArrowUpRight className="h-4 w-4 text-rose-500" aria-hidden="true" /><span>Expenses</span><strong>Rs {preview.expenses}</strong></div>
        </div>
        <div className="hkk-phone-actions">
          {demoPreview ? <>
            <button type="button" disabled title="Sign in to add income"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Income</button>
            <button type="button" disabled title="Sign in to add expenses"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Expense</button>
          </> : <>
            <Link to="/income" aria-label="Open income flow"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Income</Link>
            <Link to="/expenses" aria-label="Open expenses flow"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Expense</Link>
          </>}
        </div>
        <div className="hkk-phone-panel">
          <div className="flex items-center justify-between"><strong>Money in view</strong><span>This month</span></div>
          <div className="hkk-phone-chart" role="img" aria-label="Illustrative monthly finance trend">
            {preview.bars.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 dark:text-slate-400"><span>Week 1</span><span>Week 4</span></div>
        </div>
        <div className="hkk-phone-panel">
          <div className="flex items-center justify-between"><strong>Savings goal</strong><span>{preview.goal}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-slate-800"><div className="h-full rounded-full bg-brand-600" style={{ width: preview.goal }} /></div>
        </div>
        <div className="hkk-phone-activity">
          <p className="hkk-phone-activity-heading text-[10px] font-bold text-slate-800 dark:text-slate-100">Recent activity</p>
          {preview.transactions.map(([label, amount, type]) => (
            <div key={label} className="hkk-phone-activity-row flex items-center justify-between border-t border-slate-100 text-[10px] dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">{label}</span>
              <strong className={type === 'income' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}>{amount}</strong>
            </div>
          ))}
        </div>
        <div className="hkk-phone-nav">
          {demoPreview ? <>
            <span><Wallet className="h-3.5 w-3.5" aria-hidden="true" />Overview</span>
            <span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />Expenses</span>
            <span><Target className="h-3.5 w-3.5" aria-hidden="true" />Goals</span>
          </> : <>
            <Link to="/dashboard" aria-label="Open dashboard"><Wallet className="h-3.5 w-3.5" aria-hidden="true" /><span>Overview</span></Link>
            <Link to="/expenses" aria-label="Open expenses"><ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /><span>Expenses</span></Link>
            <Link to="/goals" aria-label="Open goals"><Target className="h-3.5 w-3.5" aria-hidden="true" /><span>Goals</span></Link>
          </>}
        </div>
      </div>
    </div>
  );
}

export default function HomeContent({ ArticleCard }) {
  const { search } = useLocation();
  const demoPreview = new URLSearchParams(search).get('demo') === 'preview';
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [cardsEntered, setCardsEntered] = useState(false);
  const visualRef = useRef(null);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (!window.IntersectionObserver || !visualRef.current) {
      setCardsEntered(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setPreviewVisible(entry.isIntersecting);
      if (entry.isIntersecting) setCardsEntered(true);
    }, { threshold: 0.1 });
    observer.observe(visualRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || interactionPaused || !previewVisible) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActiveIndex((index) => (index + 1) % previews.length);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [reducedMotion, interactionPaused, previewVisible]);

  const selectPreview = (index) => { setActiveIndex(index); setInteractionPaused(true); };
  const preview = previews[activeIndex];

  return (
    <>
      {demoPreview && <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-slate-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-slate-200" role="status">
        <div><strong className="block text-base text-slate-900 dark:text-white">Demo Preview Mode</strong><p>Fictional figures only. No account or session is created. Adding finances is unavailable here; sign in to use your own data.</p></div>
        <Link to="/login" className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">Exit preview and sign in</Link>
      </div>}
      <section className="hkk-hero" aria-labelledby="hkk-hero-heading">
        <div className="hkk-hero-copy">
          <p className="hkk-eyebrow">Personal &amp; shared financial management</p>
          <h1 id="hkk-hero-heading">Make sense of your money.<span>Make room for more.</span></h1>
          <p className="hkk-hero-description">Your income, expenses, budgets, savings goals and shared costs — finally in one clear place. See where your money goes and plan what comes next.</p>
          <div className="hkk-hero-actions">
            <Link to="/register" className="hkk-button hkk-button-primary">Start Managing Your Money <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link to="/login" className="hkk-button hkk-button-secondary">Sign In</Link>
          </div>
          <div className="hkk-trust" aria-label="Built for individuals, households and shared living">
            <span><Check aria-hidden="true" /> Built for Individuals</span><span><Check aria-hidden="true" /> Households</span><span><Check aria-hidden="true" /> Shared Living</span>
          </div>
        </div>
        <div className={`hkk-hero-visual${previewVisible ? '' : ' is-offscreen'}`} id="finance-preview" ref={visualRef}>
          <div className="hkk-visual-glow" aria-hidden="true" />
          <FinancePhone preview={preview} demoPreview={demoPreview} />
          <div className={`hkk-mode-list${cardsEntered ? ' is-entered' : ''}`} aria-label="Choose a sample finance mode">
            {previews.map(({ id, title, description, icon: Icon }, index) => (
              <button key={id} type="button" className={`hkk-mode-card ${index === activeIndex ? 'is-active' : ''}`} onClick={() => selectPreview(index)} aria-pressed={index === activeIndex}>
                <span className="hkk-mode-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span><strong>{title}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="hkk-features" aria-labelledby="hkk-features-heading">
        <div className="hkk-section-intro"><p className="hkk-eyebrow">Made for real life</p><h2 id="hkk-features-heading">One app. Every way you manage money.</h2><p>Whether you're managing your own finances, your family's money, or shared costs with friends, HisabKi Kitab brings everything together.</p></div>
        <div className="hkk-feature-grid">
          {featureCards.map(({ title, icon: Icon, description, points, to, action }) => (
            <article key={title} className="hkk-feature-card">
              <span className="hkk-feature-icon"><Icon className="h-6 w-6" aria-hidden="true" /></span>
              <h3>{title}</h3><p>{description}</p>
              <ul>{points.map((point) => <li key={point}><Check className="h-4 w-4" aria-hidden="true" />{point}</li>)}</ul>
              <Link to={to}>{action} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="hkk-guides" aria-labelledby="hkk-guides-heading">
        <div className="hkk-guides-head"><div><p className="hkk-eyebrow"><BookOpen className="h-4 w-4" aria-hidden="true" /> Practical guides</p><h2 id="hkk-guides-heading">A little clarity goes a long way.</h2><p>Read practical guides for budgeting, saving and sharing expenses.</p></div><Link to="/learn">Browse all guides <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
        <div className="grid gap-5 md:grid-cols-3">{articles.filter((article) => article.featured).slice(0, 3).map((article) => <ArticleCard key={article.slug} article={article} />)}</div>
        <Link to="/tools" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Explore financial tools <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </section>
    </>
  );
}
