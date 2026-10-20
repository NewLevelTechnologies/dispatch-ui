import { describe, it, expect } from 'vitest';
import { isOutAllDay, overlappingAbsence } from './timeOff';

const span = (start: string, end: string, allDay = false) => ({
  startsAt: `2026-03-19T${start}:00Z`,
  endsAt: `2026-03-19T${end}:00Z`,
  allDay,
  label: 'Dentist',
});

describe('isOutAllDay', () => {
  it('is only true for an all-day span', () => {
    expect(isOutAllDay({ timeOff: [] })).toBe(false);
    expect(isOutAllDay({ timeOff: [span('09:00', '11:00')] })).toBe(false);
    expect(isOutAllDay({ timeOff: [span('09:00', '11:00'), span('00:00', '23:59', true)] })).toBe(true);
  });
});

describe('overlappingAbsence', () => {
  const nine = { startHour: 9, endHour: 11 };

  it('finds the absence the kept window lands in', () => {
    expect(overlappingAbsence(nine, '2026-03-19', [span('10:00', '12:00')], 'UTC')?.label).toBe('Dentist');
  });

  // Touching edges don't count.
  it('lets a window that starts as the absence ends through', () => {
    expect(overlappingAbsence(nine, '2026-03-19', [span('07:00', '09:00')], 'UTC')).toBeNull();
    expect(overlappingAbsence(nine, '2026-03-19', [span('11:00', '13:00')], 'UTC')).toBeNull();
  });

  it('reads the window in the TENANT zone', () => {
    // 9–11a in Phoenix is 16:00–18:00Z.
    expect(
      overlappingAbsence(nine, '2026-03-19', [span('16:30', '17:00')], 'America/Phoenix'),
    ).not.toBeNull();
    expect(overlappingAbsence(nine, '2026-03-19', [span('10:00', '11:00')], 'America/Phoenix')).toBeNull();
  });
});
