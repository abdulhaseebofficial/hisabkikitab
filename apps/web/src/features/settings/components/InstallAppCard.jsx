import { Download, Smartphone, CheckCircle2, Laptop } from 'lucide-react';
import Card, { CardHeader } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import usePwaInstall from '../../../shared/hooks/usePwaInstall';
import InstallAppModal from '../../../shared/components/pwa/InstallAppModal';
import useT from '../../../shared/i18n/I18nProvider';

export default function InstallAppCard() {
  const { t } = useT();
  const {
    isInstalled,
    isPromptAvailable,
    isIos,
    modalOpen,
    openModal,
    closeModal,
    triggerInstall,
  } = usePwaInstall();

  return (
    <>
      <Card>
        <CardHeader
          title={t('settings.appTitle', 'App & Installation')}
          subtitle={t('settings.appSubtitle', 'Install HisabKi Kitab as a fast mobile or desktop app.')}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-brand-100 bg-brand-50/40 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('settings.appCardName', 'HisabKi Kitab App')}
                </h4>
                {isInstalled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('pwa.installedBadge', 'Installed')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                {isInstalled
                  ? t('settings.appInstalledDesc', 'Running in standalone app mode with instant launch.')
                  : t('settings.appReadyDesc', 'Install on Android, iOS, Windows, or Mac with 0 MB storage overhead.')}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={isInstalled ? 'secondary' : 'primary'}
              size="sm"
              onClick={isInstalled ? openModal : triggerInstall}
              icon={isInstalled ? Laptop : Download}
            >
              {isInstalled
                ? t('settings.appGuideBtn', 'Device Guide')
                : t('settings.appInstallBtn', 'Install App')}
            </Button>
          </div>
        </div>
      </Card>

      <InstallAppModal
        open={modalOpen}
        onClose={closeModal}
        isInstalled={isInstalled}
        isPromptAvailable={isPromptAvailable}
        isIos={isIos}
        onTriggerInstall={triggerInstall}
      />
    </>
  );
}
