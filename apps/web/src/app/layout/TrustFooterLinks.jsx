import { Link } from 'react-router-dom';

const links = [
  ['My finances', '/dashboard'], ['Guides', '/learn'], ['Tools', '/tools'],
  ['About', '/about'], ['Contact', '/contact'], ['Privacy', '/privacy'],
  ['Terms', '/terms'], ['Disclaimer', '/disclaimer'],
];

export default function TrustFooterLinks() {
  return <nav aria-label="Product and site information" className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
    {links.map(([label, to]) => <Link key={to} to={to} className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline dark:hover:text-brand-300">{label}</Link>)}
  </nav>;
}
