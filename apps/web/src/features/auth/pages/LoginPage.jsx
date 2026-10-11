import { useLocation, useNavigate } from 'react-router-dom';
import Link from '../../../shared/seo/PublicLink';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Input from '../../../shared/components/ui/Input';
import PasswordInput from '../../../shared/components/ui/PasswordInput';
import Button from '../../../shared/components/ui/Button';
import { useAuth } from '../AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import useAsync from '../../../shared/hooks/useAsync';
import authService from '../api/authApi';
import { getErrorMessage } from '../../../shared/api/client';
import useT from '../../../shared/i18n/I18nProvider';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // Whether Google sign-in exists on this deployment is the server's answer,
  // so the button cannot appear on an install that has not configured it.
  const { data: config } = useAsync(() => authService.config(), []);

  /** Where the student was heading before they were sent to log in. */
  const target = location.state && location.state.from ? location.state.from.pathname : '/dashboard';

  const onGoogle = async (idToken) => {
    try {
      const result = await loginWithGoogle(idToken);
      navigate(result.created ? '/onboarding' : target, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    try {
      await login(values);
      // Send the student back to wherever they were headed before the redirect.
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  /** One-tap login for the seeded demo account. */
  const fillDemo = () => {
    setValue('email', 'demo@hisabkikitab.app');
    setValue('password', 'demo1234');
    toast('Demo details filled in. Hit Log in.', { icon: '\uD83D\uDC4B' });
  };

  return (
    <AuthShell
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.newHere')}{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('auth.register')}
          </Link>
        </>
      }
    >
      <GoogleSignInButton
        config={config && config.google}
        onCredential={onGoogle}
        disabled={isSubmitting}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          error={errors.email && errors.email.message}
          {...register('email')}
        />

        <div>
          <PasswordInput
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
            error={errors.password && errors.password.message}
            {...register('password')}
          />

          <div className="mt-2.5 text-right">
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
        </div>

        <Button type="submit" icon={LogIn} loading={isSubmitting} size="lg" className="w-full">
          {t('auth.login')}
        </Button>

        <button
          type="button"
          onClick={fillDemo}
          className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-medium text-slate-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400"
        >
          {t('auth.tryDemo')}
        </button>
      </form>
    </AuthShell>
  );
}
