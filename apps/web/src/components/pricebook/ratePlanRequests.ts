import { useTranslation } from '@dispatch/i18n';
import { errorCode, extractApiError } from '../../lib/toast';

export const RATE_PLANS_KEY = ['rate-plans'] as const;

/** Words a rate plan write failure from its `code`. */
export function useRatePlanError() {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    switch (code) {
      case 'NAME_TAKEN':
      case 'DEFAULT_REQUIRED':
      case 'DEFAULT_MUST_BE_ACTIVE':
      case 'RATE_PLAN_IN_USE':
        return t(`settings.ratePlans.errors.${code}`);
      default:
        return extractApiError(err) ?? t('settings.ratePlans.errors.generic');
    }
  };
}
