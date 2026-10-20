import type { DispatchLifecycle, DispatchStatus } from '@dispatch/api';
import type { Step, StepState } from '../components';

/**
 * The visit timeline as `Stepper` steps — a simplified take on web's
 * DispatchDetailDrawer timeline. Deliberately drops two things that drawer
 * has: the "Technician/Customer notified" rows (derived there from a
 * separate notification-log query — audit-grade precision a dispatcher
 * needs, not a technician looking at their own phone, who already knows
 * whether they were texted) and the "skip from Scheduled straight to
 * Arrived" affordance (still representable here — see dispatchLifecycleStep
 * below — just not surfaced with the same emphasis distinction).
 */
export function dispatchLifecycleSteps(
  lifecycle: DispatchLifecycle | null | undefined,
  status: DispatchStatus,
  t: (key: string) => string
): Step[] {
  const enrouteDone = !!lifecycle?.enroute;
  const arrivedDone = !!lifecycle?.arrived;
  const departedDone = !!lifecycle?.departed;

  const stepState = (done: boolean, isCurrent: boolean): StepState => (done ? 'done' : isCurrent ? 'now' : 'pending');

  return [
    // A dispatch is always past "scheduled" the moment it exists.
    { label: t('workOrders.dispatches.drawer.timelineScheduled'), state: 'done' },
    {
      label: t('workOrders.dispatches.drawer.timelineEnRoute'),
      state: stepState(enrouteDone, status === 'EN_ROUTE'),
    },
    {
      label: t('workOrders.dispatches.drawer.timelineArrived'),
      state: stepState(arrivedDone, status === 'IN_PROGRESS'),
    },
    {
      label: t('workOrders.dispatches.drawer.timelineDeparted'),
      state: stepState(departedDone, status === 'COMPLETED'),
    },
  ];
}
