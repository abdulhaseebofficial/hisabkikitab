import PublicFrame from './PublicFrame';
import ThemeToggle from './ThemeToggle';

export default function PublicSiteLayout({ children }) {
  return <PublicFrame controls={<ThemeToggle className="rounded-full" />}>{children}</PublicFrame>;
}
