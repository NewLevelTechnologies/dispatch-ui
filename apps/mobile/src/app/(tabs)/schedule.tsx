import { useTranslation } from '@dispatch/i18n';
import { PlaceholderScreen } from '../../components';

/** Phase 2 — see apps/mobile/PLAN.md. */
export default function ScheduleScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('nav.schedule')} body={t('nav.placeholderBody')} />;
}
