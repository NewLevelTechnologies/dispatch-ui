import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DispatchWeek, { type WeekProps } from './DispatchWeek';
import type { BoardWeekCell, BoardWeekTech } from '../../api/setup';

const DAYS = [
  '2026-03-16',
  '2026-03-17',
  '2026-03-18',
  '2026-03-19',
  '2026-03-20',
  '2026-03-21',
  '2026-03-22',
];

function cell(date: string, over: Partial<BoardWeekCell> = {}): BoardWeekCell {
  return { date, stopCount: 0, hasUrgent: false, hasUnreleased: false, off: false, ...over };
}

function tech(over: Partial<BoardWeekTech> = {}): BoardWeekTech {
  return {
    id: 'u1',
    name: 'Maya Alvarez',
    regionIds: ['r1'],
    primaryRegionId: 'r1',
    cells: DAYS.map((d) => cell(d)),
    ...over,
  };
}

function renderWeek(over: Partial<WeekProps> = {}) {
  const techs = over.groups?.flatMap((g) => g.techs) ?? [tech()];
  const props: WeekProps = {
    groups: over.groups ?? [
      { key: '__all', label: null, techs, stops: 0, held: 0 },
    ],
    days: DAYS,
    density: 'comfortable',
    collapsed: [],
    onToggleGroup: vi.fn(),
    capacityStops: 6,
    today: null,
    onOpenDay: vi.fn(),
    ...over,
  };
  return { ...render(<DispatchWeek {...props} />), props };
}

const cells = () => Array.from(document.querySelectorAll('.db-wcell')) as HTMLElement[];

describe('DispatchWeek columns', () => {
  // Rendered from the server's list, so a week containing a DST change still
  // has exactly seven columns and the two sides cannot disagree.
  it('renders a column per day the server sent', () => {
    renderWeek();
    const heads = document.querySelectorAll('.db-whead');
    expect(heads).toHaveLength(7);
    expect(heads[0]).toHaveTextContent('Mon 16');
    expect(heads[6]).toHaveTextContent('Sun 22');
  });

  it('marks the column the dispatcher is standing in', () => {
    renderWeek({ today: '2026-03-18' });
    expect(document.querySelectorAll('.db-whead')[2]).toHaveClass('today');
    expect(cells()[2]).toHaveClass('today');
  });
});

describe('DispatchWeek cells', () => {
  it('shows the stop count per day', () => {
    renderWeek({
      groups: [
        {
          key: '__all',
          label: null,
          stops: 4,
          held: 0,
          techs: [
            tech({
              cells: DAYS.map((d, i) => cell(d, { stopCount: i === 1 ? 4 : 0 })),
            }),
          ],
        },
      ],
    });
    expect(cells()[1]).toHaveTextContent('4');
  });

  // The week's whole point while staging: which days still have work nobody
  // has been told about.
  it('flags a day with unhanded-over work', () => {
    renderWeek({
      groups: [
        {
          key: '__all',
          label: null,
          stops: 1,
          held: 1,
          techs: [
            tech({
              cells: DAYS.map((d, i) => cell(d, { stopCount: 1, hasUnreleased: i === 3 })),
            }),
          ],
        },
      ],
    });
    expect(cells()[3].querySelector('.db-wheld')).toBeTruthy();
    expect(cells()[0].querySelector('.db-wheld')).toBeNull();
  });

  it('flags a day carrying urgent work', () => {
    renderWeek({
      groups: [
        {
          key: '__all',
          label: null,
          stops: 1,
          held: 0,
          techs: [
            tech({ cells: DAYS.map((d, i) => cell(d, { stopCount: 1, hasUrgent: i === 2 })) }),
          ],
        },
      ],
    });
    expect(cells()[2]).toHaveTextContent('▲');
    expect(cells()[1]).not.toHaveTextContent('▲');
  });

  // A dash, not a zero: "0" reads as available and empty, which is the
  // opposite of what an absence means.
  it('renders time off as a dash with no load bar', () => {
    renderWeek({
      groups: [
        {
          key: '__all',
          label: null,
          stops: 0,
          held: 0,
          techs: [tech({ cells: DAYS.map((d, i) => cell(d, { off: i === 0 })) })],
        },
      ],
    });
    expect(cells()[0]).toHaveTextContent('—');
    expect(cells()[0]).toHaveClass('off');
    expect(cells()[0].querySelector('.db-load')).toBeNull();
  });

  // Same ramp as the day board's row: one load language across granularities.
  it('colours the bar against the tenant capacity', () => {
    renderWeek({
      groups: [
        {
          key: '__all',
          label: null,
          stops: 8,
          held: 0,
          techs: [
            tech({
              cells: DAYS.map((d, i) => cell(d, { stopCount: i === 0 ? 8 : i === 1 ? 6 : 2 })),
            }),
          ],
        },
      ],
    });
    expect(cells()[0].querySelector('.db-load')).toHaveClass('over');
    expect(cells()[1].querySelector('.db-load')).toHaveClass('high');
    expect(cells()[2].querySelector('.db-load')?.className).toBe('db-load');
  });

  // Without a server-supplied denominator a bar is decoration, the same way a
  // fill against a guessed duration would be.
  it('draws no bar when the tenant capacity is unknown', () => {
    renderWeek({ capacityStops: null });
    expect(cells()[0].querySelector('.db-load')).toBeNull();
  });
});

describe('DispatchWeek navigation', () => {
  // The week answers "which day should I be looking at" — so a cell is a
  // target, not a container.
  it('opens that day’s board when a cell is clicked', async () => {
    const user = userEvent.setup();
    const onOpenDay = vi.fn();
    renderWeek({ onOpenDay });

    await user.click(cells()[4]);
    expect(onOpenDay).toHaveBeenCalledWith('2026-03-20');
  });

  it('names each cell for a screen reader', () => {
    renderWeek();
    expect(
      screen.getByRole('button', { name: /Maya Alvarez, Mon 16 — 0 dispatches/ }),
    ).toBeInTheDocument();
  });

  // The denominator is per DAY; a week total against it would say every
  // working tech is catastrophically over capacity.
  it('totals the week in the tech column without a capacity bar', () => {
    renderWeek({
      groups: [
        {
          key: '__all',
          label: null,
          stops: 7,
          held: 0,
          techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 1 })) })],
        },
      ],
    });
    const techCol = document.querySelector('.db-techcol:not(.db-head .db-techcol)');
    expect(techCol).toHaveTextContent('7');
    expect(techCol?.querySelector('.db-load')).toBeNull();
  });
});
