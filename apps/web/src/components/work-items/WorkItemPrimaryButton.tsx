import { useTranslation } from '@dispatch/i18n';
import { ArchiveBoxIcon, CalendarIcon, CheckIcon } from '@heroicons/react/16/solid';
import { useGlossary } from '../../contexts/GlossaryContext';
import type { primaryAction } from '../../lib/workItemSteps';
import { Button } from '../catalyst/button';

/** The one next-step button for a work item (see `primaryAction`). Shared by
 *  the Work items tab header and the Compact overview rows. */
export default function WorkItemPrimaryButton({
  action,
  pending,
  onPartsArrived,
  onSchedule,
  onFindings,
  onComplete,
}: {
  action: ReturnType<typeof primaryAction>;
  pending: boolean;
  onPartsArrived: () => void;
  onSchedule: () => void;
  onFindings: () => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  switch (action) {
    case 'partsArrived':
      return (
        <Button color="accent" size="xs" onClick={onPartsArrived} disabled={pending}>
          <ArchiveBoxIcon data-slot="icon" />
          {t('workOrders.workItems.partsArrived')}
        </Button>
      );
    case 'schedule':
      return (
        <Button color="accent" size="xs" onClick={onSchedule}>
          <CalendarIcon data-slot="icon" />
          {t('workOrders.workItems.scheduleEntity', { entity: getName('dispatch').toLowerCase() })}
        </Button>
      );
    case 'findings':
      return (
        <Button color="accent" size="xs" onClick={onFindings}>
          {t('workOrders.workItems.addFindings')}
        </Button>
      );
    case 'complete':
      return (
        <Button color="accent" size="xs" onClick={onComplete} disabled={pending}>
          <CheckIcon data-slot="icon" />
          {t('workOrders.workItems.markComplete')}
        </Button>
      );
    default:
      return null;
  }
}
