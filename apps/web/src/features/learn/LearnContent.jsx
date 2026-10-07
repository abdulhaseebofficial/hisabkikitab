import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, PiggyBank, TrendingUp, PieChart, Wallet, House, Users, HandCoins, Laptop, Store, Repeat } from 'lucide-react';
import PublicHeader from '../../app/layout/PublicHeader';
import Card from '../../shared/components/ui/Card';
import AdSlot from './AdSlot';
import HomeContent from './HomeContent';
import { articles, categories, indexableCategories, articlePath, getArticle, paginate, learnTitle, learnDescription, disclaimer } from './content';

const icons = { PiggyBank, TrendingUp, PieChart, Wallet, House, Users, HandCoins, Laptop, Store, Repeat };
const linkStyle = 'inline-flex min-h-11 items-center gap-2 rounded-xl font-medium text-brand-700 hover:underline dark:text-brand-300';
const relatedTools = {
  saving: ['/tools/savings-goal-calculator', 'Estimate a savings goal'],
  budgeting: ['/tools/budget-calculator', 'Try the monthly budget calculator'],
  'personal-finance': ['/tools/emergency-fund-calculator', 'Estimate an emergency fund'],
  household: ['/tools/budget-calculator', 'Plan a household budget'],
  'shared-living': ['/tools/expense-split-calculator', 'Calculate an equal expense split'],
  'lending-borrowing': ['/tools/debt-repayment-calculator', 'Estimate debt repayment time'],
  freelancing: ['/tools/freelancer-income-calculator', 'Estimate freelance income'],
  'financial-habits': ['/tools/budget-calculator', 'Plan a monthly budget'],
};
const date = (value) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

export { PublicHeader };

function CategoryCards({ items = categories }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((category) => {
    const Icon = icons[category.icon] || BookOpen;
    return <Link key={category.slug} to={`/learn/${category.slug}`} className="hw-card group p-5 transition-colors hover:border-brand-400"><Icon className="mb-4 h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" /><h3 className="font-semibold">{category.name}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{category.description}</p><span className={`${linkStyle} mt-2 text-sm`}>Explore guides <ArrowRight className="h-4 w-4" aria-hidden="true" /></span></Link>;
  })}</div>;
}

export function ArticleCard({ article }) {
  const category = categories.find((item) => item.slug === article.category);
  const Icon = icons[category.icon];
  return <Card as="article" padded={false} className="flex flex-col overflow-hidden"><div className="relative flex aspect-[16/7] items-center justify-center border-b border-slate-200 bg-brand-50 dark:border-slate-800 dark:bg-brand-500/10">{article.image?.src ? <img src={article.image.src} alt={article.image.alt || ''} width={article.image.width || 960} height={article.image.height || 420} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : <Icon className="h-12 w-12 text-brand-600/70 dark:text-brand-300/70" aria-hidden="true" />}</div><div className="flex flex-1 flex-col p-5"><Link className={`${linkStyle} text-xs`} to={`/learn/${article.category}`}>{category.name}</Link><h3 className="font-display text-xl font-semibold leading-snug"><Link to={articlePath(article)} className="hover:underline">{article.title}</Link></h3><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{article.excerpt}</p><p className="mb-4 mt-4 text-xs text-slate-500 dark:text-slate-400">{article.readingTime} min read · Updated <time dateTime={article.updatedAt}>{date(article.updatedAt)}</time></p><Link className={`${linkStyle} mt-auto text-sm`} to={articlePath(article)} aria-label={`Read Article: ${article.title}`}>Read Article <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div></Card>;
}

function ArticleGrid({ items }) {
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map((article) => <ArticleCard key={articlePath(article)} article={article} />)}</div>;
}

function Breadcrumbs({ page }) {
  return <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-600 dark:text-slate-400"><ol className="flex flex-wrap items-center gap-x-2 gap-y-1"><li><Link className="hover:underline" to="/">Home</Link></li><li aria-hidden="true">/</li><li>{page.type === 'index' ? <span aria-current="page">Learn</span> : <Link className="hover:underline" to="/learn">Learn</Link>}</li>{page.category && <><li aria-hidden="true">/</li><li>{page.article ? <Link className="hover:underline" to={`/learn/${page.category.slug}`}>{page.category.name}</Link> : <span aria-current="page">{page.category.name}</span>}</li></>}{page.article && <><li aria-hidden="true">/</li><li aria-current="page">{page.title}</li></>}</ol></nav>;
}

function Block({ block }) {
  switch (block.type) {
    case 'paragraph': return <p>{block.text}</p>;
    case 'subheading': return <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{block.text}</h3>;
    case 'list': case 'steps': {
      const Tag = block.type === 'steps' ? 'ol' : 'ul';
      return <Tag className={`${Tag === 'ol' ? 'list-decimal' : 'list-disc'} space-y-3 pl-6`}>{block.items.map((item, index) => <li key={index}>{item}</li>)}</Tag>;
    }
    case 'table': return <div role="region" aria-label={block.caption} tabIndex={0} className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><caption className="p-3 text-left font-medium">{block.caption}</caption><thead className="bg-slate-100 dark:bg-slate-800"><tr>{block.headers.map((cell) => <th scope="col" className="px-4 py-3" key={cell}>{cell}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i} className="border-t border-slate-200 dark:border-slate-700">{row.map((cell, j) => <td className="px-4 py-3" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case 'calculation': case 'tip': return <aside className="rounded-xl border-l-4 border-brand-500 bg-brand-50 p-5 dark:bg-brand-500/10"><p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">{block.type === 'tip' ? 'Keep in mind' : 'Worked calculation'}</p><p>{block.text}</p></aside>;
    default: return null;
  }
}

function Article({ article }) {
  const related = articles.filter((item) => item.slug !== article.slug).sort((a, b) => Number(b.category === article.category) - Number(a.category === article.category)).slice(0, 3);
  const relatedTool = relatedTools[article.category];
  return <><article className="mx-auto max-w-3xl"><header><p className="mb-3 text-sm font-medium text-brand-700 dark:text-brand-300">Financial guide · {article.readingTime} min read</p><h1 className="text-3xl leading-tight sm:text-5xl">{article.title}</h1><p className="mt-5 text-sm text-slate-600 dark:text-slate-400">By {article.author}</p><p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">Published <time dateTime={article.publishedAt}>{date(article.publishedAt)}</time> · Updated <time dateTime={article.updatedAt}>{date(article.updatedAt)}</time></p><p className="mt-6 text-lg leading-8 text-slate-700 dark:text-slate-300">{article.introduction}</p></header><AdSlot position="after-introduction" enabled={article.ads?.includes('after-introduction')} /><Card as="nav" aria-label="Table of contents" className="my-8"><h2 className="mb-3 font-semibold">In this guide</h2><ol className="grid gap-1 text-sm sm:grid-cols-2">{[...article.sections, { id: 'sources', title: 'Sources & references' },...(article.faqs?.length?[{id:'faqs',title:'Frequently asked questions'}]:[])].map((section) => <li key={section.id}><a className={`${linkStyle} py-1`} href={`#${section.id}`}>{section.title}</a></li>)}</ol></Card>{article.sections.map((section, index) => <div key={section.id}><section id={section.id} className="mb-9 scroll-mt-6"><h2 className="mb-4 font-display text-2xl font-semibold">{section.title}</h2><div className="space-y-4 text-base leading-8 text-slate-700 dark:text-slate-300">{section.blocks.map((block, i) => <Block key={i} block={block} />)}</div></section>{index === Math.floor(article.sections.length / 2) && article.readingTime >= 6 && <AdSlot position="middle" enabled={article.ads?.includes('middle')} />}</div>)}<section id="sources" className="scroll-mt-6"><h2 className="font-display text-2xl font-semibold">Sources & references</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">Further reading. Examples and calculations are original illustrations; these sources do not establish local tax or legal rules.</p><ul className="mt-3 space-y-3">{article.sources.map((source) => <li key={source.url}><a className={`${linkStyle} break-words text-sm`} href={source.url} rel="noopener noreferrer">{source.title}</a></li>)}</ul></section>{article.faqs?.length>0&&<section id="faqs" className="mt-9 scroll-mt-6"><h2 className="font-display text-2xl font-semibold">Frequently asked questions</h2><div className="mt-4 space-y-3">{article.faqs.map((faq)=><details key={faq.question} className="hw-card p-4"><summary className="cursor-pointer font-medium">{faq.question}</summary><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{faq.answer}</p></details>)}</div></section>}<footer className="mt-8 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-400"><strong>Financial disclaimer</strong><p className="mt-2">{disclaimer}</p>{relatedTool && <Link className={`${linkStyle} mt-3`} to={relatedTool[0]}>{relatedTool[1]} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}</footer>{article.cta&&<aside className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/20 dark:bg-brand-500/10"><h2 className="font-display text-xl font-semibold">Put this guide into practice</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Use Hisab Ki Kitab to keep your plan alongside your day-to-day financial records.</p><Link className={`${linkStyle} mt-2`} to={article.cta.to}>{article.cta.label} <ArrowRight className="h-4 w-4"/></Link></aside>}<AdSlot position="before-related" enabled={article.ads?.includes('before-related')} /></article><section className="mt-12"><h2 className="mb-5 font-display text-2xl font-semibold">Related guides</h2><ArticleGrid items={related} /></section></>;
}

function ArticleDetail({ summary }) {
  const [article, setArticle] = useState(null);
  useEffect(() => {
    let active = true;
    getArticle(summary.slug).then((loaded) => { if (active) setArticle(loaded); });
    return () => { active = false; };
  }, [summary.slug]);
  if (article) return <Article article={article} />;
  return <article aria-busy="true" className="mx-auto max-w-3xl"><h1 className="font-display text-3xl leading-tight sm:text-5xl">{summary.title}</h1><p className="mt-5 text-sm text-slate-500">Loading guide…</p><div className="mt-8 space-y-4"><div className="hw-skeleton h-5 w-full" /><div className="hw-skeleton h-5 w-5/6" /><div className="hw-skeleton h-5 w-4/6" /></div></article>;
}

function Pagination({ page, pages, category }) {
  if (pages < 2) return null;
  const href = (number) => `/learn/${category}?page=${number}`;
  return <nav aria-label="Article pages" className="mt-8 flex flex-wrap items-center justify-center gap-2"><Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={`${linkStyle} rounded-lg border border-slate-200 px-3 dark:border-slate-700 ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`} to={href(Math.max(1, page - 1))}>Previous</Link><span aria-live="polite" className="px-3 text-sm text-slate-600 dark:text-slate-400">Page {page} of {pages}</span><Link aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={`${linkStyle} rounded-lg border border-slate-200 px-3 dark:border-slate-700 ${page >= pages ? 'pointer-events-none opacity-40' : ''}`} to={href(Math.min(pages, page + 1))}>Next</Link></nav>;
}

export default function LearnContent({ page }) {
  const [searchParams] = useSearchParams();
  if (page.type === 'not-found') return <section className="py-16"><h1 className="text-4xl">Guide not found</h1><p className="my-4">This guide or category does not exist.</p><Link to="/learn" className={linkStyle}>Explore all guides <ArrowRight className="h-4 w-4" /></Link></section>;
  if (page.type === 'article') return <><Breadcrumbs page={page} />{page.article.sections ? <Article article={page.article} /> : <ArticleDetail key={page.article.slug} summary={page.article} />}</>;
  if (page.type === 'category') {
    const items = articles.filter((article) => article.category === page.category.slug);
    const pagination = paginate(items, searchParams.get('page'));
    return <><Breadcrumbs page={page} /><h1 className="text-4xl">{page.category.name}</h1><p className="mb-8 mt-4 max-w-2xl leading-7 text-slate-600 dark:text-slate-400">{page.description}</p><h2 className="mb-5 font-display text-2xl font-semibold">{items.length ? 'Latest guides' : 'New guides are on the way'}</h2>{items.length ? <><ArticleGrid items={pagination.items} /><Pagination page={pagination.page} pages={pagination.pages} category={page.category.slug} /></> : <Card><p className="leading-7 text-slate-600 dark:text-slate-400">We are preparing guides for this category. Start with these practical money essentials in the meantime.</p><Link to="/learn" className={`${linkStyle} mt-3`}>Browse published guides</Link></Card>}{!items.length && <section className="mt-8"><h2 className="mb-5 font-display text-2xl font-semibold">Start with the essentials</h2><ArticleGrid items={articles.slice(0, 3)} /></section>}</>;
  }
  if (page.type === 'home') return <HomeContent ArticleCard={ArticleCard} />;
  return <><Breadcrumbs page={page} /><section><div className="mb-8 max-w-3xl"><h1 className="text-3xl leading-tight sm:text-5xl">{learnTitle}</h1><p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-400">Practical guides to help you save, budget, earn and manage money more effectively.</p><p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Use what you learn alongside expense tracking, budgeting and financial goals in Hisab Ki Kitab.</p></div><h2 className="mb-5 font-display text-2xl font-semibold">Start here</h2><ArticleGrid items={articles.filter((article) => article.featured).slice(0, 6)} /><div className="mb-5 mt-12"><h2 className="font-display text-2xl font-semibold">Explore by category</h2></div><CategoryCards items={indexableCategories} /><div className="mt-10 rounded-2xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-500/20 dark:bg-brand-500/10"><h2 className="font-display text-2xl font-semibold">Put your plan into practice</h2><p className="mt-2 max-w-2xl leading-7 text-slate-600 dark:text-slate-400">Track expenses, create a budget and set a savings goal in Hisab Ki Kitab.</p><div className="mt-4 flex flex-wrap gap-4"><Link to="/expenses" className={linkStyle}>Track expenses</Link><Link to="/budget" className={linkStyle}>Create a budget</Link><Link to="/goals" className={linkStyle}>Set a savings goal</Link></div></div></section></>;
}
