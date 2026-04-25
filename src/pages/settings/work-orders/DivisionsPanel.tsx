import { useGlossary } from '../../../contexts/GlossaryContext';
import { useTranslation } from 'react-i18next';
import { divisionsApi } from '../../../api';
import TaxonomyManager from '../../../components/settings/TaxonomyManager';

export default function DivisionsPanel() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const division = getName('division');
  const divisions = getName('division', true);

  return (
    <TaxonomyManager
      title={divisions}
      description={t('settings.divisions.description', { divisions: divisions.toLowerCase() })}
      entityLabel={division}
      entityLabelPlural={divisions}
      api={divisionsApi}
      queryKey={['divisions']}
    />
  );
}
