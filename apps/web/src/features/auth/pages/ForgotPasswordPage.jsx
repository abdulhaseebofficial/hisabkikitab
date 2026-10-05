import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Input from '../../../shared/components/ui/Input';
import Button from '../../../shared/components/ui/Button';
import authService from '../api/authApi';
import { getErrorMessage } from '../../../shared/api/client';
import useT from '../../../shared/i18n/I18nProvider';
import useAsync from '../../../shared/hooks/useAsync';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

export default function ForgotPassword() {
  const { t } = useT();
  const [sent, setSent] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [devLink, setDevLink] = useState(null);
  const { data: config } = useAsync(() => authService.config(), []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async (values) => {
    try {
      const response = await authService.forgotPassword(values.email);
      if (response.deliveryAvailable === false) {
        setUnavailable(true);
        return;
      }
      setSent(true);
      // In development the API echoes the reset link so it can be tested
      // without configuring SMTP.
      if (response.devResetUrl) setDevLink(response.devResetUrl);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (unavailable || config?.passwordReset?.enabled === false) {
    return (
      <AuthShell
        title={t('auth.resetUnavailableTitle')}
        subtitle={t('auth.resetUnavailableDetail')}
        footer={<Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">{t('auth.backToLogin')}</Link>}
      >
        <Link to="/contact" className="inline-flex min-h-11 items-center font-medium text-brand-600 hover:underline dark:text-brand-400">
          {t('auth.contactSupport')}
        </Link>
      </AuthShell>
    );
  }

  if (sent) {
    return (
      <AuthShell
        title={t('auth.checkInbox')}
        subtitle={t('auth.resetSentDetail')}
        footer={
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('auth.backToLogin')}
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 p-8 text-center dark:border-slate-800">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-safe/10 dark:bg-safe/15">
            <MailCheck className="h-7 w-7 text-safe" />
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('auth.didNotGetIt')}
          </p>

          {devLink && (
            <div className="w-full rounded-xl bg-caution/10 p-3 text-left dark:bg-caution/15">
              <p className="text-xs font-semibold text-caution">{t('auth.developmentMode')}</p>
              <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-400">
                {t('auth.smtpNotConfigured')}
              </p>
              <a href={devLink} className="mt-1 block break-all text-xs font-medium text-brand-600 hover:underline">
                {devLink}
              </a>
            </div>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitleShort')}
      footer={
        <>
          {t('auth.rememberedIt')}{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('auth.backToLogin')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          autoFocus
          error={errors.email && errors.email.message}
          {...register('email')}
        />

        <Button type="submit" icon={Send} loading={isSubmitting} size="lg" className="w-full">
          {t('auth.sendResetLinkShort')}
        </Button>
      </form>
    </AuthShell>
  );
}
