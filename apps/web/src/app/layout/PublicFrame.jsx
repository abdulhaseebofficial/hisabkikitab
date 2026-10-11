import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';

// The static HTML and interactive application share the same geometry.
export default function PublicFrame({ children, controls }) {
  return <div className="min-h-full bg-canvas-light dark:bg-canvas-dark">
    <a href="#main-content" className="hw-skip-link">Skip to content</a>
    <PublicHeader controls={controls || <span className="inline-block h-11 w-11" aria-hidden="true" />} />
    <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">{children}</main>
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 lg:px-12"><PublicFooter /></div>
  </div>;
}
