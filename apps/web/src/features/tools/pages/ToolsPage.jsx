import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BriefcaseBusiness, HandCoins, PieChart, Scale, ShieldCheck, Target, Users, ArrowRight } from 'lucide-react';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import PublicSiteLayout from '../../../app/layout/PublicSiteLayout';
import { calculate, fields, tools } from '../content/calculations';
import { trackEvent } from '../../../shared/analytics/analytics';

const icons = { BriefcaseBusiness, HandCoins, PieChart, Scale, ShieldCheck, Target, Users };
const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function toolsMetadata(tool, pathname, origin) {
  const missing = !tool && pathname !== '/tools';
  const page = tool ? { title: `${tool.title} | Hisabki Kitab`, description: tool.description } : missing ? {
    title: 'Calculator not found | Hisabki Kitab', description: 'This calculator is unavailable. Browse the available financial tools.',
  } : {
    title: 'Financial Calculators & Tools | Hisabki Kitab',
    description: 'Free, practical money calculators to complement budgeting, expense tracking, savings goals and financial management with Hisabki Kitab.',
  };
  const canonical = new URL(pathname, origin).href;
  const schema = missing ? [] : [{ '@context':'https://schema.org','@type':'WebApplication','name':page.title,'description':page.description,'applicationCategory':'FinanceApplication','url':canonical,'isAccessibleForFree':true }, { '@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[ { '@type':'ListItem','position':1,'name':'Home','item':origin }, { '@type':'ListItem','position':2,'name':'Financial tools','item':`${origin}/tools` }, ...(tool ? [{ '@type':'ListItem','position':3,'name':tool.title,'item':canonical }] : []) ] }];
  return { ...page, canonical, schema, tags:[['name','description',page.description],['name','robots',missing?'noindex,follow':'index,follow'],['property','og:title',page.title],['property','og:description',page.description],['property','og:url',canonical],['property','og:type','website']] };
}

function useToolsMetadata(tool) {
  const location = useLocation();
  useEffect(() => {
    const previousTitle = 'Hisabki Kitab - Smart money manager for hostel students';
    const old = [...document.head.querySelectorAll('[data-tools-seo], [data-learn-seo], meta[name="description"]')];
    old.forEach((node) => node.remove());
    const origin = import.meta.env.VITE_SITE_URL || window.location.origin;
    const page = toolsMetadata(tool, location.pathname, origin);
    document.title = page.title;
    const nodes = page.tags.map(([attribute,key,value]) => { const node=document.createElement('meta');node.setAttribute(attribute,key);node.content=value;node.dataset.toolsSeo='';document.head.appendChild(node);return node; });
    const canonical=document.createElement('link');canonical.rel='canonical';canonical.href=page.canonical;canonical.dataset.toolsSeo='';document.head.appendChild(canonical);nodes.push(canonical);
    const schema=document.createElement('script');schema.type='application/ld+json';schema.textContent=JSON.stringify(page.schema);schema.dataset.toolsSeo='';document.head.appendChild(schema);nodes.push(schema);
    return () => { nodes.forEach((node)=>node.remove());document.title=previousTitle; };
  }, [location.pathname, tool?.slug]);
}

function ToolCard({ tool }) {
  const Icon=icons[tool.icon]||PieChart;
  return <Link to={`/tools/${tool.slug}`} className="hw-card p-5 transition-colors hover:border-brand-400"><Icon className="mb-4 h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true"/><h2 className="font-semibold">{tool.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{tool.description}</p><span className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700 dark:text-brand-300">Open calculator <ArrowRight className="h-4 w-4" aria-hidden="true"/></span></Link>;
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
  return <><section className="mb-8 max-w-3xl"><p className="mb-3 text-sm font-medium text-brand-700 dark:text-brand-300"><Link className="hover:underline" to="/tools">Financial tools</Link> / Calculator</p><h1 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">{tool.title}</h1><p className="mt-4 leading-7 text-slate-600 dark:text-slate-400">{tool.description} This estimate is a planning aid to support the financial records and plans you manage with Hisabki Kitab.</p></section><div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)]"><Card as="form" onSubmit={handleSubmit} className="space-y-4"><h2 className="font-display text-xl font-semibold">Enter your figures</h2><p className="text-sm text-slate-500 dark:text-slate-400">Amounts are entered in PKR unless the field says otherwise.</p><div className="grid gap-4 sm:grid-cols-2">{fields[tool.slug].map(([name,label])=><label key={name} className="block text-sm font-medium text-slate-700 dark:text-slate-300"><span>{label}</span><input className="hw-input mt-1.5" type="number" inputMode="decimal" min="0" step={['people','monthsWorked','months'].includes(name)?'1':'0.01'} max={name==='reservePercent'||name==='annualRate'?100:undefined} value={values[name]??''} onChange={(event)=>setValues((current)=>({...current,[name]:event.target.value}))} aria-label={label} required /></label>)}</div><div className="flex flex-wrap gap-3"><Button type="submit">Calculate</Button><Button type="button" variant="outline" onClick={()=>{setValues({});setResult(null);}}>Reset</Button></div></Card><Card aria-live="polite" className="lg:sticky lg:top-6"><h2 className="font-display text-xl font-semibold">Your estimate</h2>{!result?<p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">Enter your numbers to see an estimate. Your inputs stay in this browser and are not saved.</p>:result.error?<p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{result.error}</p>:<><dl className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">{result.rows.map(([label,value])=><div key={label} className="flex items-start justify-between gap-4 py-3 text-sm"><dt className="text-slate-600 dark:text-slate-400">{label}</dt><dd className="text-right font-semibold text-slate-900 dark:text-slate-100">{value===null?'Not estimated':/months|people/i.test(label)?String(value):/rate|percentage/i.test(label)?`${value}%`:format(value)}</dd></div>)}</dl>{result.breakdown&&<div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><h3 className="font-semibold">Expense breakdown</h3><ul className="mt-2 grid grid-cols-2 gap-2 text-xs">{result.breakdown.map(([key,value])=><li className="flex justify-between gap-2" key={key}><span className="capitalize text-slate-600 dark:text-slate-400">{key}</span><span>{format(value)}</span></li>)}</ul></div>}{result.message&&<p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{result.message}</p>}</>}</Card></div><aside className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/20 dark:bg-brand-500/10"><h2 className="font-display text-xl font-semibold">Keep your money plan up to date</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Use Hisabki Kitab to record real transactions and follow your budgets, income, goals and shared costs over time.</p><Link to={to} className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-300">{action}<ArrowRight className="h-4 w-4" aria-hidden="true"/></Link></aside></>;
}

export function ToolsContent({ tool }) { return tool ? <ToolCalculator key={tool.slug} tool={tool}/> : <><section className="hw-card-hero mb-10 p-6 sm:p-9"><p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Supporting tools for your finances</p><h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Financial Calculators</h1><p className="mt-4 max-w-2xl leading-7 text-slate-600 dark:text-slate-400">Simple planning tools to complement expense tracking, budgeting, financial goals and shared money management in Hisabki Kitab.</p><Link to="/dashboard" className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-brand-700 hover:underline dark:text-brand-300">Open your financial dashboard <ArrowRight className="h-4 w-4"/></Link></section><section><h2 className="mb-5 font-display text-2xl font-semibold">Choose a calculator</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{tools.map((item)=><ToolCard key={item.slug} tool={item}/>)}</div></section></>; }

export default function ToolsPage() {
  const {tool:slug}=useParams();
  const tool=tools.find((item)=>item.slug===slug);
  useToolsMetadata(tool);
  return <PublicSiteLayout>{slug&&!tool?<section><h1 className="font-display text-3xl">Calculator not found</h1><Link to="/tools" className="mt-4 inline-flex min-h-11 items-center text-brand-700 hover:underline dark:text-brand-300">Browse financial tools</Link></section>:<ToolsContent tool={tool}/>}</PublicSiteLayout>;
}
