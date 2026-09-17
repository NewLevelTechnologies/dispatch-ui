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
  return {
    date,
    stopCount: 0,
    committedCount: 0,
    hasUrgent: false,
    hasUnreleased: false,
    off: false,
    ...over,
  };
}

function tech(over: Partial<BoardWeekTech> = {}): BoardWeekTech {
  return {
    id: 'u1',
    name: 'Maya Alvarez',
    regionIds: ['r1'],
    divisionIds: [],
    cells: DAYS.map((d) => cell(d)),
    ...over,
  };
}

function renderWeek(over: Partial<WeekProps> = {}) {
  const props: WeekProps = {
    techs: over.techs ?? [tech()],
    regionLabel: () => null,
    days: DAYS,
    density: 'comfortable',
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
      techs: [
            tech({
              cells: DAYS.map((d, i) => cell(d, { stopCount: i === 1 ? 4 : 0 })),
            }),
          ],
    });
    expect(cells()[1]).toHaveTextContent('4');
  });

  // The week's whole point while staging: which days still have work nobody
  // has been told about.
  it('flags a day with unhanded-over work', () => {
    renderWeek({
      techs: [
            tech({
              cells: DAYS.map((d, i) => cell(d, { stopCount: 1, hasUnreleased: i === 3 })),
            }),
          ],
    });
    expect(cells()[3].querySelector('.db-wheld')).toBeTruthy();
    expect(cells()[0].querySelector('.db-wheld')).toBeNull();
  });

  it('flags a day carrying urgent work', () => {
    renderWeek({
      techs: [
            tech({ cells: DAYS.map((d, i) => cell(d, { stopCount: 1, hasUrgent: i === 2 })) }),
          ],
    });
    expect(cells()[2]).toHaveTextContent('▲');
    expect(cells()[1]).not.toHaveTextContent('▲');
  });

  // A dash, not a zero: "0" reads as available and empty, which is the
  // opposite of what an absence means.
  it('renders time off as a dash with no load bar', () => {
    renderWeek({
      techs: [tech({ cells: DAYS.map((d, i) => cell(d, { off: i === 0 })) })],
    });
    expect(cells()[0]).toHaveTextContent('—');
    expect(cells()[0]).toHaveClass('off');
    expect(cells()[0].querySelector('.db-load')).toBeNull();
  });

  // Same ramp as the day board's row: one load language across granularities.
  it('colours the bar against the tenant capacity', () => {
    renderWeek({
      techs: [
            tech({
              cells: DAYS.map((d, i) => cell(d, { stopCount: i === 0 ? 8 : i === 1 ? 6 : 2 })),
            }),
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

// The week is the surface a dispatcher scans to CHOOSE a day, so an
// understated cell doesn't merely look wrong — it routes the work. A narrowed
// board (region scope or division filter) knows a tech is committed elsewhere
// and must say so, or the fullest day on the board reads as the lightest.
describe('DispatchWeek committed work', () => {
  const bar = (el: HTMLElement) => el.querySelector('.db-load');
  const widths = (el: HTMLElement) => {
    const solid = el.querySelector('.db-load i') as HTMLElement | null;
    const hatch = el.querySelector('.db-load u') as HTMLElement | null;
    return {
      solid: solid ? parseFloat(solid.style.width) : null,
      hatch: hatch ? parseFloat(hatch.style.width) : null,
    };
  };

  it('prints "3 of 5" where the in-scope and committed counts differ', () => {
    renderWeek({
      techs: [
        tech({
          cells: DAYS.map((d, i) =>
            cell(d, { stopCount: 3, committedCount: i === 0 ? 5 : 3 }),
          ),
        }),
      ],
    });
    expect(cells()[0]).toHaveTextContent('3 of 5');
    // Not "3 of 3" on an unfiltered day — a cell restating itself is noise.
    expect(cells()[1]).toHaveTextContent('3');
    expect(cells()[1]).not.toHaveTextContent('of');
  });

  // The count and the bar are one claim. Printing "3 of 5" above a bar filled
  // to three sixths says both things at once and the dispatcher believes the
  // picture, not the digits.
  it('draws the committed-elsewhere share as a hatched remainder', () => {
    renderWeek({
      techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 3, committedCount: 5 })) })],
    });
    const { solid, hatch } = widths(cells()[0]);
    expect(solid).toBeCloseTo(50, 5); // 3 of 6
    expect(hatch).toBeCloseTo(100 / 3, 5); // the other 2 of 6
    expect(solid! + hatch!).toBeCloseTo((5 / 6) * 100, 5);
  });

  // The regression this guards: a bar derived from in-scope work alone paints
  // a tech whose whole day sits in another region as the most available person
  // on the board — green, nearly empty, and the obvious place to put the job.
  it('does not read as a light day when every stop is committed elsewhere', () => {
    renderWeek({
      techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 0, committedCount: 6 })) })],
    });
    const { solid, hatch } = widths(cells()[0]);
    expect(solid).toBe(0);
    expect(hatch).toBeCloseTo(100, 5);
    // Colour follows committed work too, or the fullest day stays green.
    expect(bar(cells()[0])).toHaveClass('high');
  });

  it('colours an over-committed day over capacity', () => {
    renderWeek({
      techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 1, committedCount: 8 })) })],
    });
    expect(bar(cells()[0])).toHaveClass('over');
    // Denominated by the larger of capacity and committed, so the overage
    // stays visible instead of being clamped flush with a full day.
    expect(widths(cells()[0]).solid).toBeCloseTo(12.5, 5);
  });

  it('draws no hatch when nothing is committed elsewhere', () => {
    renderWeek({
      techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 2, committedCount: 2 })) })],
    });
    expect(widths(cells()[0]).hatch).toBeNull();
  });

  it('explains the split on hover only where the two differ', () => {
    renderWeek({
      techs: [
        tech({
          cells: DAYS.map((d, i) =>
            cell(d, { stopCount: 2, committedCount: i === 0 ? 5 : 2 }),
          ),
        }),
      ],
    });
    expect(cells()[0].querySelector('[title]')).toHaveAttribute(
      'title',
      '2 in scope \u00b7 3 committed elsewhere',
    );
    expect(cells()[1].querySelector('[title]')).toBeNull();
  });

  // An absence is an absence. A tech who is out has no committed work to
  // report and no bar to draw, whatever the server sent alongside it.
  it('still renders time off as a bare dash', () => {
    renderWeek({
      techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 0, committedCount: 4, off: true })) })],
    });
    expect(cells()[0]).toHaveTextContent('\u2014');
    expect(bar(cells()[0])).toBeNull();
    expect(cells()[0].querySelector('[title]')).toBeNull();
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
      techs: [tech({ cells: DAYS.map((d) => cell(d, { stopCount: 1 })) })],
    });
    const techCol = document.querySelector('.db-techcol:not(.db-head .db-techcol)');
    expect(techCol).toHaveTextContent('7');
    expect(techCol?.querySelector('.db-load')).toBeNull();
  });
});
