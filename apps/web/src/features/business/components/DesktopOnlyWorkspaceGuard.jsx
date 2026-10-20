import { Laptop, ArrowLeft, Sparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Badge from '../../../shared/components/ui/Badge';
import useViewport from '../../../shared/hooks/useViewport';
import { useBusiness } from '../BusinessContext';
import useT from '../../../shared/i18n/I18nProvider';

/**
 * DesktopOnlyWorkspaceGuard
 *
 * Enforces the Desktop Business Experience policy:
 * - On desktop & tablet (>= 768px): Renders full advanced business workspace.
 * - On mobile (< 768px): Renders a clean branded notice with an essential mobile summary
 *   and a working "Back to Business Dashboard" action.
 * - Preserves business selection and login session.
 */
export default function DesktopOnlyWorkspaceGuard({
  featureName = 'Advanced Business Workspace',
  featureDescription,
  featureIcon: FeatureIcon = Laptop,
  essentialSummary,
  quickActionLink,
  children,
}) {
  const { isMobile } = useViewport();
  const navigate = useNavigate();
  const { activeBusiness } = useBusiness();
  const { t } = useT();

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-lg py-6 px-2 sm:px-4" data-testid="desktop-only-guard-notice">
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-canvas-darkCard text-center">
        {/* Top Feature & Device Badge */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <FeatureIcon className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          <Badge tone="brand" className="text-[11px] font-semibold">
            {t('business.desktopWorkspaceBadge', 'Desktop Workspace')}
          </Badge>
          <span className="text-xs text-slate-400 dark:text-slate-500">• {t('business.largeScreenOnly', 'Laptop / Desktop')}</span>
        </div>

        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
          {featureName}
        </h1>

        {featureDescription && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {featureDescription}
          </p>
        )}

        {/* Required Branded Notice */}
        <div className="mt-4 rounded-2xl border border-brand-200/60 bg-brand-50/50 p-4 dark:border-brand-900/40 dark:bg-brand-950/20">
          <p className="text-xs font-medium leading-relaxed text-brand-900 dark:text-brand-200">
            {t(
              'business.desktopOnlyNotice',
              'This advanced Business Mode feature is available on Desktop or Laptop. Please open HisabKi Kitab on a larger screen to use this workspace.'
            )}
          </p>
        </div>

        {/* Optional Essential Mobile Summary */}
        {essentialSummary && (
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-left dark:border-slate-800/80 dark:bg-slate-900/50" data-testid="essential-mobile-summary">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              <span>{t('business.essentialSummaryTitle', 'Essential Mobile Summary')}</span>
            </div>
            {essentialSummary}
          </div>
        )}

        {/* Primary & Secondary Actions */}
        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            type="button"
            onClick={() => navigate('/business')}
            className="flex w-full items-center justify-center gap-2 bg-brand-600 text-white hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('business.backToDashboard', 'Back to Business Dashboard')}
          </Button>

          {quickActionLink && (
            <Link
              to={quickActionLink.to}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {quickActionLink.label}
            </Link>
          )}
        </div>

        {/* Session Preservation Footnote */}
        <div className="mt-5 border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {activeBusiness?.name ? (
            <span>
              {t('business.businessLabel', 'Business')}: <strong className="text-slate-600 dark:text-slate-300">{activeBusiness.name}</strong> • {t('business.sessionActive', 'Session Active')}
            </span>
          ) : (
            <span>{t('business.sessionActive', 'Session Active')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
