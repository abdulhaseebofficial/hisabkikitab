import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import Input from '../../../shared/components/ui/Input';
import PasswordInput from '../../../shared/components/ui/PasswordInput';
import PasswordChecklist from '../../../shared/components/ui/PasswordChecklist';
import Button from '../../../shared/components/ui/Button';
import { useAuth } from '../AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import useAsync from '../../../shared/hooks/useAsync';
import authService from '../api/authApi';
import { getErrorMessage, getFieldErrors } from '../../../shared/api/client';
import {
  nameSchema,
  emailSchema,
  passwordSchema,
  PASSWORD_MISMATCH,
  TERMS_MESSAGE,
} from '../../../shared/validation/rules';
import useT from '../../../shared/i18n/I18nProvider';

/**
 * The same rules the API enforces, imported rather than restated.
 *
 * This form used to carry its own copy - "at least 8 characters, a letter and a
 * number" - which was already looser than what the server accepted. Now both
 * sides call the same functions from @hisabkikitab/contracts, so the checklist
 * a student reads cannot promise something the server will refuse.
 */
const schema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    acceptTerms: z.boolean(),
  })
  /*
   * Both checks are refinements on the object, and acceptTerms is a plain
   * boolean rather than z.literal(true), deliberately. A field that fails its
   * own schema stops zod before any object-level refinement runs - so with
   * z.literal(true), an unticked box hid the "passwords do not match" message
   * until the box was ticked. Keeping the shape always-valid lets every
   * cross-field rule report independently, which is what a student needs:
   * one message per thing that is actually wrong.
   */
  .refine((values) => values.password === values.confirmPassword, {
    message: PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  })
  .refine((values) => values.acceptTerms === true, {
    message: TERMS_MESSAGE,
    path: ['acceptTerms'],
  });

export default function Register() {
  const { t } = useT();
  const { register: signUp, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const { data: config } = useAsync(() => authService.config(), []);

  const onGoogle = async (idToken) => {
    try {
      await loginWithGoogle(idToken);
      navigate('/onboarding', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm({
    resolver: zodResolver(schema),
    // Validate as they type: the checklist is only useful if it keeps up, and
    // the submit button can only be honestly disabled if validity is current.
    mode: 'onChange',
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
  });

  const password = watch('password');
  const acceptedTerms = watch('acceptTerms');

  const onSubmit = async (values) => {
    try {
      await signUp(values);
      navigate('/onboarding', { replace: true });
    } catch (error) {
      // Map any server-side field errors back onto the form inputs.
      const fields = getFieldErrors(error);
      if (fields.length) {
        fields.forEach((field) => setError(field.field, { message: field.message }));
      }
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      {config && config.google && config.google.enabled && (
        <>
          {/*
            Google is held shut until the terms below are accepted.

            Signing up with Google skips the form, and with it the checkbox - so
            without this, one way in asks for consent and the other quietly does
            not. Rather than restating the terms in small print next to the
            button and calling that agreement, the same tick governs both doors.
          */}
          <GoogleSignInButton
            config={config.google}
            onCredential={onGoogle}
            disabled={isSubmitting || !acceptedTerms}
          />
          {!acceptedTerms && (
            <p className="-mt-1 mb-4 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {t('auth.acceptTermsForGoogle')}
            </p>
          )}
        </>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label={t('auth.fullName')}
          autoComplete="name"
          placeholder={t('auth.fullNamePlaceholder')}
          error={errors.name && errors.name.message}
          {...register('name')}
        />

        <Input
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={t('auth.emailPlaceholder')}
          error={errors.email && errors.email.message}
          {...register('email')}
        />

        <div className="space-y-2">
          <PasswordInput
            autoComplete="new-password"
            placeholder={t('auth.newPasswordPlaceholder')}
            error={errors.password && errors.password.message}
            {...register('password')}
          />
          <PasswordChecklist value={password} />
        </div>

        <PasswordInput
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          placeholder={t('auth.confirmPasswordPlaceholder')}
          error={errors.confirmPassword && errors.confirmPassword.message}
          {...register('confirmPassword')}
        />

        <div className="rounded-xl bg-slate-100/70 p-4 dark:bg-slate-950/50">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              aria-describedby={errors.acceptTerms ? 'terms-error' : undefined}
              {...register('acceptTerms')}
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span className="block font-medium text-slate-800 dark:text-slate-200">
                {t('auth.agreeTerms')}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                {t('auth.agreeTermsDetail')}
              </span>
            </span>
          </label>
          <p className="ml-7 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <Link className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300" to="/terms">{t('auth.termsOfUse')}</Link>
            <Link className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300" to="/privacy">{t('auth.privacyPolicy')}</Link>
          </p>
          {errors.acceptTerms && (
            <p id="terms-error" className="mt-2 text-xs font-medium text-danger">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          icon={UserPlus}
          loading={isSubmitting}
          disabled={!isValid}
          size="lg"
          className="w-full"
        >
          {t('auth.createAccount')}
        </Button>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {t('auth.noBankLogin')}
        </p>
      </form>
    </AuthShell>
  );
}
