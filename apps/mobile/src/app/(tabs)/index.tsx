import { useTranslation } from '@dispatch/i18n';
import { PlaceholderScreen } from '../../components';

/**
 * The default tab. Phase 2 replaces this with the technician's actual
 * schedule for today — see apps/mobile/PLAN.md.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('nav.today')} body={t('nav.placeholderBody')} />;
}
