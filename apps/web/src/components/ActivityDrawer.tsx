import { useTranslation } from '@dispatch/i18n';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ActivityStream from './ActivityStream';
import NoteComposer from './NoteComposer';
import { Button } from './catalyst/button';
import { SlideOver } from './catalyst/slideover';

interface Props {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
}

/**
 * Right-edge slide-over (~448px / max-w-md) that hosts the WO's activity feed
 * and the inline note composer. Replaces the always-on right rail per §5d:
 * one entry point on the page (an `Activity ●` button) opens this for both
 * reading and writing. Composer autofocuses on open so the empty state of a
 * fresh WO doesn't read as a deserted log.
 */
export default function ActivityDrawer({ open, onClose, workOrderId }: Props) {
  const { t } = useTranslation();
  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-md">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
          {t('workOrders.activity.heading')}
        </h2>
        <Button plain onClick={onClose} aria-label={t('common.close')}>
          <XMarkIcon className="size-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <NoteComposer workOrderId={workOrderId} autoFocus={open} />
        <ActivityStream workOrderId={workOrderId} />
      </div>
    </SlideOver>
  );
}
