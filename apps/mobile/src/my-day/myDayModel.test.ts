import type { MyDayStop } from '@dispatch/api';
import {
  clampOffset,
  dayName,
  focusAction,
  formatDuration,
  formatEstimate,
  isLive,
  isPast,
  onSiteMinutes,
  pickFocus,
  routeStops,
  shiftDay,
  showTomorrow,
  swipeStep,
} from './myDayModel';

const stop = (over: Partial<MyDayStop> = {}): MyDayStop =>
  ({ dispatchId: 'd', status: 'SCHEDULED', arrivedAt: null, departedAt: null, ...over }) as MyDayStop;

describe('isPast / isLive', () => {
  it.each(['COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('%s is behind the tech', (s) => {
    expect(isPast(s)).toBe(true);
    expect(isLive(s)).toBe(false);
  });

  it.each(['EN_ROUTE', 'IN_PROGRESS'] as const)('%s is happening now', (s) => {
    expect(isLive(s)).toBe(true);
    expect(isPast(s)).toBe(false);
  });

  it('SCHEDULED is neither', () => {
    expect(isPast('SCHEDULED')).toBe(false);
    expect(isLive('SCHEDULED')).toBe(false);
  });
});

describe('routeStops', () => {
  it('drops cancellations and keeps everything else in the order sent', () => {
    const stops = [
      stop({ dispatchId: 'a', status: 'COMPLETED' }),
      stop({ dispatchId: 'b', status: 'CANCELLED' }),
      stop({ dispatchId: 'c', status: 'SCHEDULED' }),
    ];
    expect(routeStops(stops).map((s) => s.dispatchId)).toEqual(['a', 'c']);
  });
});

describe('pickFocus', () => {
  it('prefers the live stop, wherever it sits in the day', () => {
    const stops = [
      stop({ dispatchId: 'a', status: 'COMPLETED' }),
      stop({ dispatchId: 'b', status: 'SCHEDULED' }),
      stop({ dispatchId: 'c', status: 'IN_PROGRESS' }),
    ];
    expect(pickFocus(stops)?.dispatchId).toBe('c');
  });

  it('falls back to the first still-scheduled stop', () => {
    const stops = [
      stop({ dispatchId: 'a', status: 'COMPLETED' }),
      stop({ dispatchId: 'b', status: 'SCHEDULED' }),
      stop({ dispatchId: 'c', status: 'SCHEDULED' }),
    ];
    expect(pickFocus(stops)?.dispatchId).toBe('b');
  });

  it('is null once the day is done — nothing left to act on', () => {
    expect(pickFocus([stop({ status: 'COMPLETED' }), stop({ status: 'NO_SHOW' })])).toBeNull();
    expect(pickFocus([])).toBeNull();
  });
});

describe('focusAction', () => {
  it('walks scheduled → en route → on site', () => {
    expect(focusAction('SCHEDULED')).toEqual({ kind: 'status', to: 'EN_ROUTE', labelKey: 'startDriving' });
    expect(focusAction('EN_ROUTE')).toEqual({ kind: 'status', to: 'IN_PROGRESS', labelKey: 'arrived' });
  });

  it('hands off to the work order to finish, rather than flipping status here', () => {
    expect(focusAction('IN_PROGRESS')).toEqual({ kind: 'complete', labelKey: 'completeVisit' });
  });

  it('offers nothing on a finished or abandoned stop', () => {
    expect(focusAction('COMPLETED')).toBeNull();
    expect(focusAction('NO_SHOW')).toBeNull();
    expect(focusAction('CANCELLED')).toBeNull();
  });
});

describe('formatEstimate', () => {
  it.each([
    [45, '~45m'],
    [60, '~1h'],
    [90, '~1½h'],
    [120, '~2h'],
    [100, '~1½h'],
  ])('%i minutes reads %s', (mins, expected) => {
    expect(formatEstimate(mins)).toBe(expected);
  });

  it('says nothing when the dispatcher gave no estimate', () => {
    expect(formatEstimate(null)).toBeNull();
    expect(formatEstimate(undefined)).toBeNull();
    expect(formatEstimate(0)).toBeNull();
    expect(formatEstimate(-5)).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45m'],
    [120, '2h'],
    [400, '6h 40m'],
  ])('%i minutes reads %s', (mins, expected) => {
    expect(formatDuration(mins)).toBe(expected);
  });
});

describe('onSiteMinutes', () => {
  it('sums only the visits with both ends recorded', () => {
    const stops = [
      stop({ arrivedAt: '2026-10-21T14:00:00Z', departedAt: '2026-10-21T15:30:00Z' }), // 90
      stop({ arrivedAt: '2026-10-21T16:00:00Z', departedAt: null }), // still on site
      stop({ arrivedAt: null, departedAt: null }),
      stop({ arrivedAt: '2026-10-21T18:00:00Z', departedAt: '2026-10-21T18:30:00Z' }), // 30
    ];
    expect(onSiteMinutes(stops)).toBe(120);
  });

  it('ignores a departure recorded before the arrival', () => {
    const stops = [stop({ arrivedAt: '2026-10-21T15:00:00Z', departedAt: '2026-10-21T14:00:00Z' })];
    expect(onSiteMinutes(stops)).toBe(0);
  });
});

describe('showTomorrow', () => {
  it('always shows when there is work', () => {
    expect(showTomorrow(2, '2026-10-24')).toBe(true); // Saturday
  });

  it('shows an empty weekday — worth saying out loud', () => {
    expect(showTomorrow(0, '2026-10-22')).toBe(true); // Thursday
  });

  it('hides an empty weekend — that is just normal', () => {
    expect(showTomorrow(0, '2026-10-24')).toBe(false); // Saturday
    expect(showTomorrow(0, '2026-10-25')).toBe(false); // Sunday
  });
});

describe('shiftDay', () => {
  it('moves whole days', () => {
    expect(shiftDay('2026-10-21', 1)).toBe('2026-10-22');
    expect(shiftDay('2026-10-21', -1)).toBe('2026-10-20');
    expect(shiftDay('2026-10-21', 0)).toBe('2026-10-21');
  });

  it('crosses month and year boundaries', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('clampOffset', () => {
  it('keeps the stepper inside a week either side', () => {
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(7)).toBe(7);
    expect(clampOffset(8)).toBe(7);
    expect(clampOffset(-8)).toBe(-7);
  });
});

describe('swipeStep', () => {
  it('treats short drags as scrolling, not a day change', () => {
    expect(swipeStep(0)).toBe(0);
    expect(swipeStep(70)).toBe(0);
    expect(swipeStep(-70)).toBe(0);
  });

  it('swiping left goes forward, right goes back', () => {
    expect(swipeStep(-120)).toBe(1);
    expect(swipeStep(120)).toBe(-1);
  });
});

describe('dayName', () => {
  const t = (k: string) => k;

  it('names the three days around today', () => {
    expect(dayName(0, '2026-10-21', t)).toBe('myDay.stepper.today');
    expect(dayName(-1, '2026-10-20', t)).toBe('myDay.stepper.yesterday');
    expect(dayName(1, '2026-10-22', t)).toBe('myDay.stepper.tomorrow');
  });

  it('uses the weekday further out', () => {
    expect(dayName(3, '2026-10-24', t)).toBe('Saturday');
    expect(dayName(-3, '2026-10-18', t)).toBe('Sunday');
  });

  it('says nothing when the date is not known yet', () => {
    expect(dayName(3, undefined, t)).toBe('');
  });
});
