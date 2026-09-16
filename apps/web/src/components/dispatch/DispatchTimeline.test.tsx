import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DispatchTimeline from './DispatchTimeline';
import type { SpineProps } from './spine';
import { buildAxis } from '../../lib/boardTime';
import type { BoardDispatch, BoardTech } from '../../api/setup';

// Fixed zone so window hours are deterministic regardless of the machine
// running the suite.
const TZ = 'UTC';

function tech(over: Partial<BoardTech> = {}): BoardTech {
  return {
    id: 'u1',
    name: 'Maya Alvarez',
    regionIds: ['r1'],
    primaryRegionId: 'r1',
    stopCount: 1,
    ...over,
  };
}

function dispatch(over: Partial<BoardDispatch> = {}): BoardDispatch {
  return {
    id: 'd1',
    workOrderId: 'wo1',
    assignedUserId: 'u1',
    seq: 1,
    // 8–10 on a 6a–8p axis.
    arrivalWindowStart: '2026-03-15T08:00:00Z',
    arrivalWindowEnd: '2026-03-15T10:00:00Z',
    estimatedDuration: null,
    status: 'SCHEDULED',
    arrivedAt: null,
    departedAt: null,
    workOrderNumber: 'WO-3841',
    workOrderTypeId: null,
    workOrderSummary: 'No cooling — RTU 2',
    customerId: 'c1',
    customerName: 'Reyes Residence',
    priority: 'NORMAL',
    recurring: false,
    serviceLocationId: 'l1',
    serviceLocationName: null,
    serviceLocationStreet: null,
    serviceLocationCity: null,
    serviceLocationState: null,
    serviceLocationZip: null,
    latitude: null,
    longitude: null,
    assignedUserName: 'Maya Alvarez',
    addressedWorkItemIds: [],
    driveMinFromPrev: null,
    releasedAt: '2026-03-15T07:00:00Z',
    version: 1,
    ...over,
  };
}

function renderTimeline(over: Partial<SpineProps> = {}) {
  const byTech = over.byTech ?? { u1: [dispatch()] };
  // Fixtures all sit inside the working day, so the axis never has to widen.
  const windows = Object.values(byTech)
    .flat()
    .map(() => ({ start: 8, end: 10 }));

  const props: SpineProps = {
    techs: over.techs ?? [tech()],
    byTech,
    density: 'comfortable',
    isToday: true,
    regionLabel: () => null,
    onOpenDispatch: vi.fn(),
    workOrderHref: (id: string) => `/work-orders/${id}?from=dispatch`,
    onContextDispatch: vi.fn(),
    axis: buildAxis(6, 20, windows),
    nowHour: null,
    capacityStops: 6,
    timeZone: TZ,
    ...over,
  };
  const result = render(<DispatchTimeline {...props} />);
  return { ...result, props };
}

const block = () => document.querySelector('.db-block') as HTMLElement;

describe('DispatchTimeline geometry', () => {
  // The load-bearing metaphor: the box is the arrival WINDOW.
  it('positions a block by its arrival window, not by an estimate', () => {
    renderTimeline();
    // 8a on a 6a–8p axis: (8-6)/14 = 14.28%, width (10-8)/14 = 14.28%.
    expect(block().style.left).toBe('14.285714285714285%');
    expect(block().style.width).toBe('14.285714285714285%');
  });

  it('draws the estimate as an inner fill proportional to the window', () => {
    // 1h estimate inside a 2h window = half filled.
    renderTimeline({ byTech: { u1: [dispatch({ estimatedDuration: 60 })] } });
    const fill = document.querySelector('.db-fill') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('50%');
  });

  // The honest common case: no estimate means no fill, never a fabricated
  // default duration.
  it('renders an outline with no fill when there is no estimate', () => {
    renderTimeline({ byTech: { u1: [dispatch({ estimatedDuration: null })] } });
    expect(document.querySelector('.db-fill')).toBeNull();
    expect(screen.getByText(/no est\./)).toBeInTheDocument();
  });

  it('caps the fill at the window even if the estimate overruns it', () => {
    // 4h estimate in a 2h window would otherwise overflow the box.
    renderTimeline({ byTech: { u1: [dispatch({ estimatedDuration: 240 })] } });
    expect((document.querySelector('.db-fill') as HTMLElement).style.width).toBe('100%');
  });
});

describe('DispatchTimeline status and release', () => {
  it('takes its status class from the shared map', () => {
    renderTimeline({ byTech: { u1: [dispatch({ status: 'IN_PROGRESS' })] } });
    expect(block().className).toContain('inprogress');
  });

  // Release is ORTHOGONAL to status: both must be able to show at once.
  it('marks an unreleased dispatch held, at any status', () => {
    renderTimeline({
      byTech: { u1: [dispatch({ status: 'EN_ROUTE', releasedAt: null })] },
    });
    expect(block().className).toContain('enroute');
    expect(block().className).toContain('held');
  });

  it('does not mark a released dispatch held', () => {
    renderTimeline();
    expect(block().className).not.toContain('held');
  });

  it('flags URGENT priority on the block', () => {
    renderTimeline({ byTech: { u1: [dispatch({ priority: 'URGENT' })] } });
    expect(block().className).toContain('urgent');
  });

  it('marks a no-show without also flagging it urgent', () => {
    renderTimeline({ byTech: { u1: [dispatch({ status: 'NO_SHOW', priority: 'URGENT' })] } });
    expect(block().className).toContain('noshow');
    // The ⊘ replaces the ▲ so the block isn't wearing two danger glyphs.
    expect(screen.getByText(/⊘/)).toBeInTheDocument();
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
  });
});

describe('DispatchTimeline drive connectors', () => {
  const first = dispatch({ id: 'd1' });
  const second = dispatch({
    id: 'd2',
    arrivalWindowStart: '2026-03-15T11:00:00Z',
    arrivalWindowEnd: '2026-03-15T13:00:00Z',
    driveMinFromPrev: 18,
  });

  it('draws a connector between consecutive stops', () => {
    renderTimeline({ byTech: { u1: [first, second] } });
    const drive = document.querySelector('.db-drive') as HTMLElement;
    expect(drive).toBeTruthy();
    expect(screen.getByText('18m drive')).toBeInTheDocument();
  });

  it('takes the warning tone over 30 minutes', () => {
    renderTimeline({
      byTech: { u1: [first, { ...second, driveMinFromPrev: 45 }] },
    });
    expect((document.querySelector('.db-drive') as HTMLElement).className).toContain('long');
  });

  // Nothing to drive from on the first stop of a day.
  it('draws no connector on a lone stop', () => {
    renderTimeline();
    expect(document.querySelector('.db-drive')).toBeNull();
  });

  it('suppresses the connector when stops are back to back', () => {
    const abutting = dispatch({
      id: 'd2',
      arrivalWindowStart: '2026-03-15T10:00:00Z',
      arrivalWindowEnd: '2026-03-15T12:00:00Z',
      driveMinFromPrev: 12,
    });
    renderTimeline({ byTech: { u1: [first, abutting] } });
    expect(document.querySelector('.db-drive')).toBeNull();
  });
});

describe('DispatchTimeline overlap', () => {
  // Warn and allow — but never hide. The pair splits the lane so neither can
  // cover the other.
  it('splits a double-booked pair into halves and flags the row', () => {
    const a = dispatch({ id: 'a' });
    const b = dispatch({
      id: 'b',
      arrivalWindowStart: '2026-03-15T09:00:00Z',
      arrivalWindowEnd: '2026-03-15T11:00:00Z',
    });
    renderTimeline({ byTech: { u1: [a, b] } });

    const blocks = Array.from(document.querySelectorAll('.db-block'));
    expect(blocks).toHaveLength(2);
    expect(blocks.every((el) => el.className.includes('clash'))).toBe(true);
    expect(blocks.filter((el) => el.className.includes('upper'))).toHaveLength(1);
    expect(blocks.filter((el) => el.className.includes('lower'))).toHaveLength(1);
    expect(document.querySelector('.db-row')?.className).toContain('clashrow');
  });

  it('leaves sequential stops unsplit', () => {
    const a = dispatch({ id: 'a' });
    const b = dispatch({
      id: 'b',
      arrivalWindowStart: '2026-03-15T11:00:00Z',
      arrivalWindowEnd: '2026-03-15T13:00:00Z',
    });
    renderTimeline({ byTech: { u1: [a, b] } });
    expect(document.querySelector('.db-block.clash')).toBeNull();
    expect(document.querySelector('.db-row')?.className).not.toContain('clashrow');
  });
});

describe('DispatchTimeline rows', () => {
  const withTimeOff = (spans: BoardTech['timeOff']) => ({
    techs: [tech({ timeOff: spans })],
    byTech: {},
  });

  it('hatches the row and drops the load bar for an all-day absence', () => {
    renderTimeline(
      withTimeOff([
        {
          startsAt: '2026-03-15T00:00:00Z',
          endsAt: '2026-03-16T00:00:00Z',
          allDay: true,
          label: 'Vacation',
        },
      ])
    );
    expect(document.querySelector('.db-row')?.className).toContain('off');
    expect(screen.getByText(/Vacation — not droppable/)).toBeInTheDocument();
    expect(document.querySelector('.db-load')).toBeNull();
  });

  // The point of spans over a boolean: a tech out all morning is still
  // bookable in the afternoon, so the row stays a working row.
  it('overlays only the absent span for a partial-day absence', () => {
    renderTimeline(
      withTimeOff([
        {
          startsAt: '2026-03-15T08:00:00Z',
          endsAt: '2026-03-15T12:00:00Z',
          allDay: false,
          label: 'Dentist',
        },
      ])
    );

    expect(document.querySelector('.db-row')?.className).not.toContain('off');
    // Still a working row: the load bar stays.
    expect(document.querySelector('.db-load')).toBeTruthy();

    const off = document.querySelector('.db-off') as HTMLElement;
    // 8a–12p on a 6a–8p axis: left (8-6)/14, width 4/14.
    expect(off.style.left).toBe('14.285714285714285%');
    expect(off.style.width).toBe('28.57142857142857%');
    expect(screen.getByText('Dentist')).toBeInTheDocument();
  });

  // Two absences in one day is a real shape — nothing prevents it — and
  // collapsing them would render an arbitrary label over an arbitrary span.
  it('renders every absence in a day, not just the first', () => {
    renderTimeline(
      withTimeOff([
        {
          startsAt: '2026-03-15T09:00:00Z',
          endsAt: '2026-03-15T10:00:00Z',
          allDay: false,
          label: 'Dentist',
        },
        {
          startsAt: '2026-03-15T15:00:00Z',
          endsAt: '2026-03-15T19:00:00Z',
          allDay: false,
          label: 'Left early',
        },
      ])
    );
    expect(document.querySelectorAll('.db-off')).toHaveLength(2);
    expect(screen.getByText('Dentist')).toBeInTheDocument();
    expect(screen.getByText('Left early')).toBeInTheDocument();
  });

  it('clips a span that runs past the axis', () => {
    renderTimeline(
      withTimeOff([
        {
          startsAt: '2026-03-15T04:00:00Z',
          endsAt: '2026-03-15T09:00:00Z',
          allDay: false,
          label: 'Early appt',
        },
      ])
    );
    const off = document.querySelector('.db-off') as HTMLElement;
    expect(off.style.left).toBe('0%');
    expect(off.style.width).toBe('21.428571428571427%');
  });

  // A row exists, so the tech is off. Rendering them available is the one
  // error this board can't afford to make permissively.
  it('treats an unplaceable span as all-day rather than dropping it', () => {
    renderTimeline(
      withTimeOff([
        { startsAt: 'garbage', endsAt: 'garbage', allDay: false, label: 'Unknown' },
      ])
    );
    expect(document.querySelector('.db-row')?.className).toContain('off');
    expect(document.querySelector('.db-load')).toBeNull();
  });

  it('leaves a tech with no absences a plain working row', () => {
    renderTimeline();
    expect(document.querySelector('.db-row')?.className).not.toContain('off');
    expect(document.querySelector('.db-off')).toBeNull();
  });

  // Coverage is NAMED, never counted. "+2" said how many regions without
  // saying which, so a dispatcher could not act on it; the names cost the same
  // pixels and are the actual fact.
  it('names the regions a tech covers', () => {
    renderTimeline({
      techs: [tech({ regionIds: ['r1', 'r2'] })],
      regionLabel: () => 'PHX · EV',
    });
    expect(screen.getByText('PHX · EV')).toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('keeps coverage on its own line, below the name', () => {
    // Inline, the two run together and escape the sticky column — the tech
    // name and the region list are separate elements for exactly this reason.
    const { container } = renderTimeline({
      techs: [tech({ regionIds: ['r1', 'r2'] })],
      regionLabel: () => 'GA · NC · FL · SC',
    });
    const name = container.querySelector('.db-tech-name');
    const meta = container.querySelector('.db-tech-meta');
    expect(name?.textContent).toBe('Maya Alvarez');
    expect(meta?.textContent).toBe('GA · NC · FL · SC');
    expect(name?.contains(meta ?? null)).toBe(false);
  });

  it('says nothing about regions when every row would say the same thing', () => {
    // A single-region tenant states nothing — the same self-hiding discipline
    // the chrome controls use, applied to a row's meta line.
    renderTimeline({ techs: [tech({ regionIds: ['r1'] })], regionLabel: () => null });
    expect(screen.queryByText(/Phoenix/)).not.toBeInTheDocument();
  });

  // Grouping is gone: region is set-valued, so a tech covering two regions had
  // no honest single group — and bands never reduced row count anyway.
  it('renders every tech as a flat row, with no group header', () => {
    renderTimeline({
      techs: [tech(), tech({ id: 'u2', name: 'Kenji Tran', regionIds: ['r2'] })],
      byTech: { u1: [dispatch()] },
    });
    expect(screen.getByText('Maya Alvarez')).toBeInTheDocument();
    expect(screen.getByText('Kenji Tran')).toBeInTheDocument();
    expect(document.querySelector('.db-group-head')).toBeNull();
    expect(document.querySelectorAll('.db-row')).toHaveLength(2);
  });
});

// The pulse says "a technician is on this job RIGHT NOW". Leaving a dispatch
// IN_PROGRESS is the ordinary case — closing out is the step techs forget — so
// without this the board claims someone is on site on days that have not
// happened, every time a dispatcher steps forward a day.
describe('DispatchTimeline live statuses', () => {
  it('pulses an in-progress block on today', () => {
    const { container } = renderTimeline({
      isToday: true,
      byTech: { u1: [dispatch({ status: 'IN_PROGRESS' })] },
    });
    expect(container.querySelector('.db-block.inprogress.live')).not.toBeNull();
  });

  it('does not pulse it on another day', () => {
    const { container } = renderTimeline({
      isToday: false,
      byTech: { u1: [dispatch({ status: 'IN_PROGRESS' })] },
    });
    expect(container.querySelector('.db-block.inprogress')).not.toBeNull();
    // Status kept, motion dropped: the board reports what it was given and
    // does not invent an outcome for a record nobody closed out.
    expect(container.querySelector('.db-block.live')).toBeNull();
  });

  it('never marks a non-live status live, even on today', () => {
    const { container } = renderTimeline({
      isToday: true,
      byTech: { u1: [dispatch({ status: 'SCHEDULED' })] },
    });
    expect(container.querySelector('.db-block.live')).toBeNull();
  });
});
