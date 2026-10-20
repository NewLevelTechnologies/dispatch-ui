import { describe, it, expect } from 'vitest';
import { DISPATCH_PRESENTATION, presentationFor } from './dispatchStatus';

// "On site right now" is a claim about NOW, so it cannot be true on any date
// but today. Leaving a job IN_PROGRESS is the ordinary case — closing out is
// the step techs forget — so this fires constantly rather than at the edges.
describe('presentationFor — live statuses cannot exist off today', () => {
  it('pulses on today', () => {
    expect(presentationFor('IN_PROGRESS', { isToday: true }).live).toBe(true);
    expect(presentationFor('EN_ROUTE', { isToday: true }).live).toBe(true);
  });

  it('does not pulse on another day', () => {
    // Nothing is en route tomorrow.
    expect(presentationFor('IN_PROGRESS', { isToday: false }).live).toBe(false);
    expect(presentationFor('EN_ROUTE', { isToday: false }).live).toBe(false);
  });

  it('keeps the status and its hue — it drops the motion only', () => {
    // A record that says IN_PROGRESS on a past day reports a real anomaly:
    // nobody closed it out. Repainting it as SCHEDULED would trade one lie for
    // a worse one by hiding it. Settling what a stale record MEANS is the
    // server's job; the board only stops asserting the part it can disprove.
    const off = presentationFor('IN_PROGRESS', { isToday: false });
    expect(off.tone).toBe('violet');
    expect(off.accent).toBe('var(--violet-500)');
  });

  it('leaves every non-live status untouched on any date', () => {
    (['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const).forEach((status) => {
      expect(presentationFor(status, { isToday: false })).toEqual(
        DISPATCH_PRESENTATION[status],
      );
    });
  });

  it('returns the shared record itself when nothing is suppressed', () => {
    // No needless copy — the shared map stays the identity for the common case.
    expect(presentationFor('SCHEDULED', { isToday: true })).toBe(
      DISPATCH_PRESENTATION.SCHEDULED,
    );
  });
});
