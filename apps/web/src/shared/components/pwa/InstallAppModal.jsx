import { useState } from 'react';
import {
  Download,
  Smartphone,
  Laptop,
  Share,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import OfficialLogo from '../layout/OfficialLogo';
import useT from '../../i18n/I18nProvider';

export default function InstallAppModal({
  open,
  onClose,
  isInstalled,
  isPromptAvailable,
  isIos,
  onTriggerInstall
}) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState(isIos ? 'ios' : 'android');
  const [installing, setInstalling] = useState(false);

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      if (onTriggerInstall) {
        await onTriggerInstall();
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pwa.modalTitle', 'Download & Install App')}
      subtitle={t('pwa.modalSubtitle', 'Get instant one-tap access on your phone or PC with zero storage overhead.')}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          {!isInstalled && isPromptAvailable && (
            <Button
              variant="primary"
              onClick={handleInstallClick}
              loading={installing}
              icon={Download}
            >
              {t('pwa.installNow', 'Install Now')}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Header App Banner */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 dark:border-brand-900/40 dark:bg-brand-950/20">
          <OfficialLogo className="h-12 w-12 shrink-0 drop-shadow-sm" />
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100">
              HisabKi Kitab App
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {isInstalled
                ? t('pwa.statusInstalled', 'Already installed on this device')
                : t('pwa.statusReady', 'Official Web App • Fast & Offline Ready')}
            </p>
          </div>
          {isInstalled ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('pwa.installedBadge', 'Installed')}
            </span>
          ) : isPromptAvailable ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleInstallClick}
              loading={installing}
              icon={Download}
            >
              {t('pwa.install', 'Install')}
            </Button>
          ) : null}
        </div>

        {/* Benefits bullets */}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
            <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
            <span>{t('pwa.benefitFast', 'Full-screen app experience')}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
            <Layers className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
            <span>{t('pwa.benefitNoStorage', '0 MB download size')}</span>
          </div>
        </div>

        {/* Tabs for instructions */}
        <div>
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('android')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                activeTab === 'android'
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Android</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                activeTab === 'ios'
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Share className="h-3.5 w-3.5" />
              <span>iPhone / iOS</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                activeTab === 'desktop'
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-700 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>PC / Laptop</span>
            </button>
          </div>

          {/* Tab contents */}
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            {activeTab === 'android' && (
              <ol className="space-y-2.5 text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    1
                  </span>
                  <div>
                    <strong>{t('pwa.androidStep1Title', 'Tap Install Now')}</strong>:{' '}
                    {t('pwa.androidStep1Desc', 'Click the "Install Now" button above to launch the native install prompt.')}
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    2
                  </span>
                  <div>
                    <strong>{t('pwa.androidStep2Title', 'Alternative')}:</strong>{' '}
                    {t(
                      'pwa.androidStep2Desc',
                      'Tap Chrome menu (⋮ in top-right) and choose "Install app" or "Add to Home screen".'
                    )}
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    3
                  </span>
                  <div>
                    <strong>{t('pwa.androidStep3Title', 'Done')}:</strong>{' '}
                    {t('pwa.androidStep3Desc', 'The app icon appears on your home screen and drawer, opening in full-screen.')}
                  </div>
                </li>
              </ol>
            )}

            {activeTab === 'ios' && (
              <ol className="space-y-2.5 text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    1
                  </span>
                  <div>
                    <strong>{t('pwa.iosStep1Title', 'Open in Safari')}:</strong>{' '}
                    {t('pwa.iosStep1Desc', 'Open this website in Safari and tap the Share button (square with arrow up).')}
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    2
                  </span>
                  <div>
                    <strong>{t('pwa.iosStep2Title', 'Add to Home Screen')}:</strong>{' '}
                    {t('pwa.iosStep2Desc', 'Scroll down and tap "Add to Home Screen" (Home Screen par shamil karein).')}
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    3
                  </span>
                  <div>
                    <strong>{t('pwa.iosStep3Title', 'Confirm Add')}:</strong>{' '}
                    {t('pwa.iosStep3Desc', 'Tap "Add" at the top right. The app will install to your iPhone home screen.')}
                  </div>
                </li>
              </ol>
            )}

            {activeTab === 'desktop' && (
              <ol className="space-y-2.5 text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    1
                  </span>
                  <div>
                    <strong>{t('pwa.pcStep1Title', 'Use Chrome or Edge')}:</strong>{' '}
                    {t('pwa.pcStep1Desc', 'Look for the Install icon in the browser address bar (top right).')}
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    2
                  </span>
                  <div>
                    <strong>{t('pwa.pcStep2Title', 'Click Install')}:</strong>{' '}
                    {t('pwa.pcStep2Desc', 'Click "Install" to create a standalone desktop app shortcut.')}
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
                    3
                  </span>
                  <div>
                    <strong>{t('pwa.pcStep3Title', 'Launch anytime')}:</strong>{' '}
                    {t('pwa.pcStep3Desc', 'Launches from your Windows Start menu, Taskbar, or macOS Dock as a dedicated app.')}
                  </div>
                </li>
              </ol>
            )}
          </div>
        </div>

        {/* Note on APK & Offline */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          <p className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-brand-500" />
            {t('pwa.appReadyInfoTitle', 'App Ready & Play Store Compatible')}
          </p>
          <p className="mt-1">
            {t(
              'pwa.appReadyInfoDesc',
              'HisabKi Kitab is packaged as a certified Progressive Web App and can also be compiled to a native signed Android APK / TWA package via Google Bubblewrap or PWABuilder.'
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}
