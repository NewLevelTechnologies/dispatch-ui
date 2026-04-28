import ActiveDispatchesWidget from './ActiveDispatchesWidget';
import ActivityStream from './ActivityStream';
import NoteComposer from './NoteComposer';

interface Props {
  workOrderId: string;
}

/**
 * Right-rail content for the WO detail page (per §3.4):
 * - Pinned Active Dispatches widget (auto-hides when nothing is active)
 * - Inline note composer
 * - Merged activity stream with filter chips and load-more
 *
 * Rendered in two places:
 * - The xl-and-up right column (always visible)
 * - The slide-over panel (toggled by the "+ Note" action bar button on smaller viewports)
 */
export default function WorkOrderActivityRail({ workOrderId }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <ActiveDispatchesWidget workOrderId={workOrderId} />
      <NoteComposer workOrderId={workOrderId} />
      <ActivityStream workOrderId={workOrderId} />
    </div>
  );
}
