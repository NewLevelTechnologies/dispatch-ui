import { useTranslation } from '@dispatch/i18n';
import { PlaceholderScreen } from '../../components';

/** Phase 6 — see apps/mobile/PLAN.md. */
export default function LookupScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('nav.lookup')} body={t('nav.placeholderBody')} />;
}
