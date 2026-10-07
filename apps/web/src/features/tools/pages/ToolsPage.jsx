import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BriefcaseBusiness, HandCoins, PieChart, Scale, ShieldCheck, Target, Users, ArrowRight } from 'lucide-react';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import PublicSiteLayout from '../../../app/layout/PublicSiteLayout';
import { calculate, fields, tools } from '../content/calculations';
import { trackEvent } from '../../../shared/analytics/analytics';
import { replacePageHead } from '../../../shared/seo/head';

const icons = { BriefcaseBusiness, HandCoins, PieChart, Scale, ShieldCheck, Target, Users };
const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const toolGuides = {
  'budget-calculator': ['/learn/budgeting/how-to-create-a-monthly-budget', 'How to create a monthly budget', 'The result subtracts the listed expenses and planned savings from monthly income.'],
  'savings-goal-calculator': ['/learn/saving/how-to-set-financial-goals', 'How to set financial goals', 'The estimate divides the remaining target by a fixed monthly contribution and rounds up to whole months.'],
  'expense-split-calculator': ['/learn/shared-living/how-to-split-expenses-with-roommates', 'How to split expenses with roommates', 'The total is divided equally. A small rounding difference may need to be assigned to one person.'],
  'emergency-fund-calculator': ['/learn/personal-finance/emergency-fund-how-much-should-you-save', 'How much to keep in an emergency fund', 'The target is essential monthly expenses multiplied by the number of months you choose, less your current reserve.'],
  'debt-repayment-calculator': ['/learn/lending-borrowing/how-to-track-money-you-lend-and-borrow', 'How to track money you lend and borrow', 'The estimate uses a constant annual rate and fixed monthly payment; lender fees and rules are not included.'],
  'net-worth-calculator': ['/learn/financial-habits/simple-ways-to-track-income-and-expenses', 'How to track income and expenses', 'The result adds the listed assets and subtracts the listed liabilities at the values you enter today.'],
  'freelancer-income-calculator': ['/learn/freelancing/how-freelancers-can-manage-irregular-income', 'How freelancers can plan irregular income', 'The estimate averages income and business costs over active months, then applies your chosen reserve percentage. It does not calculate tax.'],
};

export function toolsMetadata(tool, pathname, origin) {
  const missing = !tool && pathname !== '/tools';
  const page = tool ? { title: `${tool.title} | Hisab Ki Kitab`, description: tool.description } : missing ? {
    title: 'Calculator not found | Hisab Ki Kitab', description: 'This calculator is unavailable. Browse the available financial tools.',
  } : {
    title: 'Financial Calculators & Tools | Hisab Ki Kitab',
    description: 'Free, practical money calculators to complement budgeting, expense tracking, savings goals and financial management with Hisab Ki Kitab.',
  };
  const canonical = missing ? null : new URL(tool ? `/tools/${tool.slug}` : '/tools', origin).href;
  const schema = missing ? [] : [
    { '@context':'https://schema.org','@type':'WebPage','name':page.title,'description':page.description,'url':canonical,'inLanguage':'en' },
    ...(tool ? [{ '@context':'https://schema.org','@type':'WebApplication','name':tool.title,'description':page.description,'applicationCategory':'FinanceApplication','url':canonical,'isAccessibleForFree':true }] : []),
    { '@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[ { '@type':'ListItem','position':1,'name':'Home','item':`${origin}/` }, { '@type':'ListItem','position':2,'name':'Financial tools','item':`${origin}/tools` }, ...(tool ? [{ '@type':'ListItem','position':3,'name':tool.title,'item':canonical }] : []) ] },
  ];
  return { ...page, canonical, schema, tags:[['name','description',page.description],['name','robots',missing?'noindex,follow':'index,follow'],['property','og:title',page.title],['property','og:description',page.description],...(canonical ? [['property','og:url',canonical]] : []),['property','og:type','website'],['property','og:site_name','Hisab Ki Kitab'],['name','twitter:card','summary'],['name','twitter:title',page.title],['name','twitter:description',page.description]] };
}

function useToolsMetadata(tool) {
  const location = useLocation();
  useEffect(() => {
    const origin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const page = toolsMetadata(tool, location.pathname, origin);
    return replacePageHead(page, 'data-tools-seo');
  }, [location.pathname, tool?.slug]);
}

function ToolCard({ tool }) {
  const Icon=icons[tool.icon]||PieChart;
  return <Link to={`/tools/${tool.slug}`} className="hw-card p-5 transition-colors hover:border-brand-400"><Icon className="mb-4 h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true"/><h3 className="font-semibold">{tool.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{tool.description}</p><span className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700 dark:text-brand-300">Open calculator <ArrowRight className="h-4 w-4" aria-hidden="true"/></span></Link>;
}

function ToolExplanation({ tool }) {
  const [path, label, assumption] = toolGuides[tool.slug];
  return <section className="mt-8 max-w-3xl" aria-label="Calculation assumptions and related guide">
    <h2 className="font-display text-xl font-semibold">How this estimate works</h2>
    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-400">{assumption} Results depend on your inputs and are for planning, not financial advice.</p>
    <Link to={path} className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-300">Read: {label} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
  </section>;
}

export function ToolCalculator({ tool }) {
  const [values,setValues]=useState({});
  const [result,setResult]=useState(null);
  const handleSubmit=(event)=>{event.preventDefault();const next=calculate(tool.slug,values);setResult(next);trackEvent('calculator_used',{calculator_name:tool.slug});if(!next.error)trackEvent('calculator_completed',{calculator_name:tool.slug});};
  const format=(value)=>Number.isFinite(value)?`PKR ${formatter.format(value)}`:'—';
  const actionMap={
    'budget-calculator':['Create your monthly budget','/budget'],
    'savings-goal-calculator':['Create a savings goal','/goals'],
    'expense-split-calculator':['Track shared expenses','/dashboard?section=daily'],
    'emergency-fund-calculator':['Set a savings goal','/goals'],
    'debt-repayment-calculator':['Manage lending & borrowing','/debts'],
    'net-worth-calculator':['Review your financial reports','/reports'],
    'freelancer-income-calculator':['Track your income','/income'],
  };
  const [action,to]=actionMap[tool.slug];
  return <><section className="mb-8 max-w-3xl"><p className="mb-3 text-sm font-medium text-brand-700 dark:text-brand-300"><Link className="hover:underline" to="/tools">Financial tools</Link> / Calculator</p><h1 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">{tool.title}</h1><p className="mt-4 leading-7 text-slate-600 dark:text-slate-400">{tool.description} This estimate is a planning aid to support the financial records and plans you manage with Hisab Ki Kitab.</p></section><div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]"><Card as="form" onSubmit={handleSubmit} className="space-y-4"><h2 className="font-display text-xl font-semibold">Enter your figures</h2><p className="text-sm text-slate-500 dark:text-slate-400">Amounts are entered in PKR unless the field says otherwise.</p><div className="grid gap-4 sm:grid-cols-2">{fields[tool.slug].map(([name,label])=><label key={name} className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span>{label}</span><input className="hw-input mt-1.5" type="number" inputMode="decimal" min="0" step={['people','monthsWorked','months'].includes(name)?'1':'0.01'} max={name==='reservePercent'||name==='annualRate'?100:undefined} value={values[name]??''} onChange={(event)=>setValues((current)=>({...current,[name]:event.target.value}))} aria-label={label} required /></label>)}</div><div className="flex flex-wrap gap-3"><Button type="submit">Calculate</Button><Button type="button" variant="outline" onClick={()=>{setValues({});setResult(null);}}>Reset</Button></div></Card><Card aria-live="polite" className="lg:sticky lg:top-6"><h2 className="font-display text-xl font-semibold">Your estimate</h2>{!result?<p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">Enter your numbers to see an estimate. Your inputs stay in this browser and are not saved.</p>:result.error?<p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{result.error}</p>:<><dl className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">{result.rows.map(([label,value])=><div key={label} className="flex items-start justify-between gap-4 py-3 text-sm"><dt className="text-slate-600 dark:text-slate-400">{label}</dt><dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{value===null?'Not estimated':/months|people/i.test(label)?String(value):/rate|percentage/i.test(label)?`${value}%`:format(value)}</dd></div>)}</dl>{result.breakdown&&<div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><h3 className="font-semibold">Expense breakdown</h3><ul className="mt-2 grid grid-cols-2 gap-2 text-xs">{result.breakdown.map(([key,value])=><li className="flex justify-between gap-2" key={key}><span className="capitalize text-slate-600 dark:text-slate-400">{key}</span><span>{format(value)}</span></li>)}</ul></div>}{result.message&&<p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{result.message}</p>}</>}</Card></div><ToolExplanation tool={tool} /><aside className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/20 dark:bg-brand-500/10"><h2 className="font-display text-xl font-semibold">Keep your money plan up to date</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Use Hisab Ki Kitab to record real transactions and follow your budgets, income, goals and shared costs over time.</p><Link to={to} className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-300">{action}<ArrowRight className="h-4 w-4" aria-hidden="true"/></Link></aside></>;
}

export function ToolsContent({ tool }) { return tool ? <ToolCalculator key={tool.slug} tool={tool}/> : <><section className="hw-card-hero mb-10 p-6 sm:p-9"><p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Supporting tools for your finances</p><h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Financial Calculators</h1><p className="mt-4 max-w-2xl leading-7 text-slate-600 dark:text-slate-400">Simple planning tools to complement expense tracking, budgeting, financial goals and shared money management in Hisab Ki Kitab.</p><Link to="/dashboard" className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-300">Open your financial dashboard <ArrowRight className="h-4 w-4"/></Link></section><section><h2 className="mb-5 font-display text-2xl font-semibold">Choose a calculator</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{tools.map((item)=><ToolCard key={item.slug} tool={item}/>)}</div></section></>; }

export default function ToolsPage() {
  const {tool:slug}=useParams();
  const tool=tools.find((item)=>item.slug===slug);
  useToolsMetadata(tool);
  return <PublicSiteLayout>{slug&&!tool?<section><h1 className="font-display text-3xl">Calculator not found</h1><Link to="/tools" className="mt-4 inline-flex min-h-11 items-center text-brand-700 hover:underline dark:text-brand-300">Browse financial tools</Link></section>:<ToolsContent tool={tool}/>}</PublicSiteLayout>;
}
