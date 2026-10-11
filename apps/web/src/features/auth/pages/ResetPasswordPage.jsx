import { useNavigate, useParams } from 'react-router-dom';
import Link from '../../../shared/seo/PublicLink';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import PasswordInput from '../../../shared/components/ui/PasswordInput';
import Button from '../../../shared/components/ui/Button';
import authService from '../api/authApi';
import { useAuth } from '../AuthContext';
import { getErrorMessage } from '../../../shared/api/client';
import PasswordChecklist from '../../../shared/components/ui/PasswordChecklist';
import { passwordSchema, PASSWORD_MISMATCH } from '../../../shared/validation/rules';
import useT from '../../../shared/i18n/I18nProvider';

// The same rules as sign-up, from the same place, so a reset cannot set a
// password the sign-up form would have refused.
const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  });

export default function ResetPassword() {
  const { t } = useT();
  const { token } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = async (values) => {
    try {
      await authService.resetPassword(token, values.password);
      // The API logs the student straight back in, so pick the session up.
      await refreshUser();
      toast.success('Password updated. You are logged in.');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSubtitleShort')}
      footer={
        <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <PasswordInput
          label={t('auth.newPassword')}
          autoComplete="new-password"
          placeholder={t('auth.atLeast8')}
          hint={t('auth.letterAndNumber')}
          autoFocus
          error={errors.password && errors.password.message}
          {...register('password')}
        />
        <PasswordChecklist value={watch('password') || ''} />

        <PasswordInput
          label={t('auth.confirmNewPassword')}
          autoComplete="new-password"
          placeholder={t('auth.confirmPasswordPlaceholder')}
          error={errors.confirmPassword && errors.confirmPassword.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" icon={KeyRound} loading={isSubmitting} size="lg" className="w-full">
          {t('auth.updatePassword')}
        </Button>
      </form>
    </AuthShell>
  );
}
