import useT from '../../../shared/i18n/I18nProvider';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Languages, PartyPopper, Target, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../shared/components/ui/Button';
import { useAuth } from '../../auth';
import { getErrorMessage } from '../../../shared/api/client';
import { GOAL_ICONS } from '../../../shared/utils/constants';
import onboardingApi from '../api/onboardingApi';
import WizardHeader from '../components/WizardHeader';
import SetupStep from '../components/SetupStep';
import MoneyStep from '../components/MoneyStep';
import PlaceStep from '../components/PlaceStep';
import GoalStep from '../components/GoalStep';

const ALL_STEPS = [
  // Mode and language come first: every later step is worded by them, and the
  // categories a person will use are decided here.
  { key: 'setup', titleKey: 'onboarding.stepSetup', icon: Languages, Component: SetupStep },
  { key: 'income', titleKey: 'onboarding.stepMoney', icon: Wallet, Component: MoneyStep },
  { key: 'place', titleKey: 'onboarding.stepPlace', icon: Check, Component: PlaceStep },
  { key: 'goal', titleKey: 'onboarding.stepGoal', icon: Target, Component: GoalStep },
];

/**
 * Which steps this person is actually asked.
 *
 * "Where you study" asks for a university and a hostel block. For anyone but a
 * student those are two fields with no honest answer, and a wizard that asks
 * them is a wizard that has not understood who it is talking to - so the step
 * is not skippable for a householder, it simply is not there.
 *
 * The progress header counts what is left, so dropping a step shortens the
 * wizard rather than leaving a gap in it.
 */
export const stepsFor = (financeMode) =>
  financeMode === 'student' ? ALL_STEPS : ALL_STEPS.filter((item) => item.key !== 'place');

/**
 * First-run wizard. Everything except the income figure is skippable.
 *
 * The three steps are separate components; what stays here is the wizard: one
 * form object, which step is showing, and what finishing means. Saving happens
 * once, at the end, in a single request - so a student who closes the tab
 * halfway through has not half-created an account.
 */
export default function Onboarding() {
  const { t } = useT();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    financeMode: (user && user.financeMode) || 'student',
    language: (user && user.language) || 'en',
    monthlyIncome: '',
    currency: user && user.currency ? user.currency : 'PKR',
    university: '',
    hostelName: '',
    goalTitle: '',
    goalTarget: '',
    goalIcon: GOAL_ICONS[0],
  });

  // Recomputed as the mode changes, which it can on the first step. Clamped,
  // because choosing householder on step 0 makes the list one shorter and an
  // index that was valid a moment ago may not be.
  const steps = stepsFor(form.financeMode);
  const current = Math.min(step, steps.length - 1);

  const set = (patch) => {
    setForm((current) => ({ ...current, ...patch }));

    // The language is the one answer that has to take effect while the wizard
    // is still open, so it is saved on the spot rather than at the end.
    if (patch.language && patch.language !== form.language) {
      onboardingApi
        .setLanguage(patch.language)
        .then(updateUser)
        .catch(() => {
          // Not worth interrupting setup for: the final save carries it too.
        });
    }
  };

  const finish = async (skipGoal = false) => {
    if (form.financeMode !== 'shared_living' && (!form.monthlyIncome || Number(form.monthlyIncome) < 0)) {
      setStep(steps.findIndex((s) => s.key === 'income'));
      return toast.error(
        t(form.financeMode === 'householder'
          ? 'onboarding.enterIncomeHouseholder'
          : 'onboarding.enterIncomeStudent')
      );
    }

    setSaving(true);
    try {
      const payload = {
        financeMode: form.financeMode,
        language: form.language,
        monthlyIncome: Number(form.monthlyIncome),
        currency: form.currency,
        university: form.university,
        hostelName: form.hostelName,
      };

      if (form.financeMode !== 'shared_living' && !skipGoal && form.goalTitle && Number(form.goalTarget) > 0) {
        payload.goal = {
          title: form.goalTitle,
          targetAmount: Number(form.goalTarget),
          icon: form.goalIcon,
        };
      }

      const data = await onboardingApi.complete(payload);
      updateUser(data.user);
      toast.success(t('shared.setupComplete'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const goForward = () => {
    if (steps[current].key === 'income' && !form.monthlyIncome) {
      return toast.error(
        t(form.financeMode === 'householder'
          ? 'onboarding.enterIncomeHouseholder'
          : 'onboarding.enterIncomeStudent')
      );
    }
    setStep(current + 1);
    return undefined;
  };

  const CurrentStep = steps[current].Component;
  const isLastStep = current === steps.length - 1;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-10">
      <WizardHeader
        steps={steps.map((item) => ({ ...item, title: t(item.titleKey) }))}
        step={current}
      />

      <div className="hw-card space-y-5 p-6">
        <CurrentStep form={form} onChange={set} />
      </div>

      <div className="mt-6 flex items-center gap-2">
        {current > 0 && (
          <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(current - 1)}>
            {t('onboarding.back')}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {form.financeMode === 'shared_living' ? <Button disabled={saving} onClick={() => finish(true)}>{t('shared.finishSetup')}</Button> : isLastStep ? (
            <>
              <Button variant="ghost" onClick={() => finish(true)} disabled={saving}>
                {t('onboarding.skip')}
              </Button>
              <Button icon={PartyPopper} loading={saving} onClick={() => finish(false)}>
                {t('onboarding.finish')}
              </Button>
            </>
          ) : (
            <Button icon={ArrowRight} onClick={goForward}>
            {t('common.continue')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
