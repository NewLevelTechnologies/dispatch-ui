import { useTranslation } from 'react-i18next';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { workOrderTypesApi } from '../../../api';
import TaxonomyManager from '../../../components/settings/TaxonomyManager';

export default function WorkOrderTypesPanel() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const workOrder = getName('work_order');

  return (
    <TaxonomyManager
      title={`${workOrder} ${t('settings.nav.types')}`}
      description={t('settings.workOrderTypes.description', { workOrder: workOrder.toLowerCase() })}
      entityLabel={`${workOrder} ${t('settings.workOrderTypes.singular')}`}
      entityLabelPlural={`${workOrder} ${t('settings.nav.types')}`}
      api={workOrderTypesApi}
      queryKey={['work-order-types']}
    />
  );
}
