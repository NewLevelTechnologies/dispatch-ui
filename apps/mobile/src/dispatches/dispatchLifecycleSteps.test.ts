import { dispatchLifecycleSteps } from './dispatchLifecycleSteps';

const t = (key: string) => key;

describe('dispatchLifecycleSteps', () => {
  it('marks only Scheduled done for a newly scheduled dispatch', () => {
    const steps = dispatchLifecycleSteps(null, 'SCHEDULED', t);
    expect(steps.map((s) => s.state)).toEqual(['done', 'pending', 'pending', 'pending']);
  });

  it('marks En route as the current step while status is EN_ROUTE', () => {
    const steps = dispatchLifecycleSteps(null, 'EN_ROUTE', t);
    expect(steps.map((s) => s.state)).toEqual(['done', 'now', 'pending', 'pending']);
  });

  it('marks En route done once its timestamp lands, even past that status', () => {
    const steps = dispatchLifecycleSteps({ scheduled: '2026-10-16T00:00:00Z', notified: null, enroute: '2026-10-20T12:21:00Z', arrived: null, departed: null }, 'IN_PROGRESS', t);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'now', 'pending']);
  });

  it('marks every reached milestone done for a completed visit', () => {
    const lifecycle = {
      scheduled: '2026-10-16T00:00:00Z',
      notified: null,
      enroute: '2026-10-20T08:00:00Z',
      arrived: '2026-10-20T08:21:00Z',
      departed: '2026-10-20T10:05:00Z',
    };
    const steps = dispatchLifecycleSteps(lifecycle, 'COMPLETED', t);
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('uses the translated labels', () => {
    const steps = dispatchLifecycleSteps(null, 'SCHEDULED', (key) => `translated:${key}`);
    expect(steps[0]!.label).toBe('translated:workOrders.dispatches.drawer.timelineScheduled');
  });
});
