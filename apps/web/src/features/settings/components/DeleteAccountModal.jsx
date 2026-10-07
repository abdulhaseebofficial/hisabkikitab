import Modal from '../../../shared/components/ui/Modal';
import Button from '../../../shared/components/ui/Button';
import PasswordInput from '../../../shared/components/ui/PasswordInput';
import useT from '../../../shared/i18n/I18nProvider';

/**
 * The password is required so a stolen access token on its own cannot wipe an
 * account. The export is suggested here because after this there is nothing
 * left to export.
 */
export default function DeleteAccountModal({ open, onClose, password, onPasswordChange, onConfirm, busy, error, onManageSpaces, manageLabel }) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.deleteAccountTitle')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep my account
          </Button>
          <Button variant="danger" loading={busy} disabled={!password} onClick={onConfirm}>
            Delete forever
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This removes your personal account data and cannot be undone. Shared Living financial history stays with its space. If you own a space, transfer ownership in Shared Living before retrying deletion. Consider exporting your data first.
        </p>
        {error && (
          <div role="alert" className="space-y-2 rounded-xl border border-amber-400 p-3 text-sm">
            <p>{error.startsWith('shared.') ? t(error) : t('settings.deleteFailed')}</p>
            {error.startsWith('shared.owner') && (
              <Button variant="secondary" onClick={onManageSpaces}>{manageLabel || t('settings.manageSharedSpaces')}</Button>
            )}
          </div>
        )}
        <PasswordInput
          label={t('settings.typePasswordToConfirm')}
          autoComplete="current-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </div>
    </Modal>
  );
}
