import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DispatchTimeline from './DispatchTimeline';
import type { BoardGroup, SpineProps } from './spine';
import { buildAxis } from '../../lib/boardTime';
import type { BoardDispatch, BoardTech } from '../../api/setup';

// Fixed zone so window hours are deterministic regardless of the machine
// running the suite.
const TZ = 'UTC';

function tech(over: Partial<BoardTech> = {}): BoardTech {
  return {
    id: 'u1',
    name: 'Maya Alvarez',
    performsFieldWork: true,
    regionIds: ['r1'],
    primaryRegionId: 'r1',
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
    notes: null,
    createdAt: '2026-03-14T00:00:00Z',
    updatedAt: '2026-03-14T00:00:00Z',
    workOrderNumber: 'WO-3841',
    workOrderTypeId: null,
    workOrderTypeName: null,
    workOrderSummary: 'No cooling — RTU 2',
    customerId: 'c1',
    customerName: 'Reyes Residence',
    serviceLocationId: 'l1',
    serviceLocationCity: null,
    serviceLocationState: null,
    assignedUserName: 'Maya Alvarez',
    addressedWorkItemIds: [],
    driveMinFromPrev: null,
    releasedAt: '2026-03-15T07:00:00Z',
    version: 1,
    ...over,
  };
}

function renderTimeline(over: Partial<SpineProps> = {}) {
  const techs = over.groups?.flatMap((g) => g.techs) ?? [tech()];
  const byTech = over.byTech ?? { u1: [dispatch()] };
  // Fixtures all sit inside the working day, so the axis never has to widen.
  const windows = Object.values(byTech)
    .flat()
    .map(() => ({ start: 8, end: 10 }));

  const groups: BoardGroup[] =
    over.groups ?? [{ key: '__all', label: null, techs, stops: 1, held: 0 }];

  const props: SpineProps = {
    groups,
    byTech,
    density: 'comfortable',
    collapsed: [],
    onToggleGroup: vi.fn(),
    onOpenDispatch: vi.fn(),
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
  it('hatches an off tech, labels the row, and shows no load bar', () => {
    renderTimeline({
      groups: [
        {
          key: '__all',
          label: null,
          techs: [tech({ availability: { allDay: true, label: 'Time off — all day' } })],
          stops: 0,
          held: 0,
        },
      ],
      byTech: {},
    });
    expect(document.querySelector('.db-row')?.className).toContain('off');
    expect(screen.getByText(/Time off — all day — not droppable/)).toBeInTheDocument();
    expect(document.querySelector('.db-load')).toBeNull();
  });

  // A multi-region tech renders ONCE — rendering them twice would let a
  // double-book hide in plain sight.
  it('marks a tech who covers more than one region', () => {
    renderTimeline({
      groups: [
        {
          key: 'r1',
          label: 'Phoenix',
          techs: [tech({ regionIds: ['r1', 'r2'] })],
          stops: 1,
          held: 0,
        },
      ],
    });
    expect(screen.getAllByText('Maya Alvarez')).toHaveLength(1);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows the stop count against the tenant capacity', () => {
    renderTimeline({ capacityStops: 6 });
    expect(screen.getByText('1/6')).toBeInTheDocument();
  });

  it('drops the avatar at compact and the block meta at dense', () => {
    const { unmount } = renderTimeline({ density: 'compact' });
    expect(document.querySelector('.db-block-s')).toBeNull();
    unmount();

    renderTimeline({ density: 'dense' });
    expect(document.querySelector('.db-block-m')).toBeNull();
  });
});

describe('DispatchTimeline axis and now-line', () => {
  it('draws the working-day axis', () => {
    renderTimeline();
    expect(screen.getByText('6a')).toBeInTheDocument();
    expect(screen.getByText('12p')).toBeInTheDocument();
    expect(screen.getByText('7p')).toBeInTheDocument();
  });

  it('draws a now-line when the board is showing today', () => {
    renderTimeline({ nowHour: 13 });
    const now = document.querySelector('.db-now') as HTMLElement;
    expect(now).toBeTruthy();
    expect(now.style.left).toBe('50%');
  });

  // A now-line on another day's board would be a lie.
  it('draws no now-line when the board is not today', () => {
    renderTimeline({ nowHour: null });
    expect(document.querySelector('.db-now')).toBeNull();
  });

  it('draws no now-line when now falls outside the axis', () => {
    renderTimeline({ nowHour: 3 });
    expect(document.querySelector('.db-now')).toBeNull();
  });
});

describe('DispatchTimeline groups', () => {
  it('renders no header for a single ungrouped bucket', () => {
    renderTimeline();
    expect(document.querySelector('.db-group-head')).toBeNull();
  });

  it('renders a header per group and collapses on click', async () => {
    const user = userEvent.setup();
    const onToggleGroup = vi.fn();
    renderTimeline({
      groups: [
        { key: 'r1', label: 'Phoenix', techs: [tech()], stops: 1, held: 0 },
        { key: 'r2', label: 'Tucson', techs: [tech({ id: 'u2', name: 'Kenji Tran' })], stops: 0, held: 0 },
      ],
      byTech: { u1: [dispatch()] },
      onToggleGroup,
    });

    expect(screen.getByText('Phoenix')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { expanded: true, name: /Phoenix/ }));
    expect(onToggleGroup).toHaveBeenCalledWith('r1');
  });

  it('summarises a collapsed group and hides its rows', () => {
    renderTimeline({
      groups: [{ key: 'r1', label: 'Phoenix', techs: [tech()], stops: 4, held: 2 }],
      collapsed: ['r1'],
    });
    expect(screen.queryByText('Maya Alvarez')).not.toBeInTheDocument();
    expect(screen.getByText(/4 dispatches/)).toBeInTheDocument();
    expect(screen.getByText(/2 not released/)).toBeInTheDocument();
  });
});

describe('DispatchTimeline interaction', () => {
  // Blocks are real buttons: drag alone is not an accessible assignment
  // mechanism, so every block has to be reachable and activatable by keyboard.
  it('opens a dispatch on click', async () => {
    const user = userEvent.setup();
    const onOpenDispatch = vi.fn();
    renderTimeline({ onOpenDispatch });

    await user.click(screen.getByRole('button', { name: /No cooling/ }));
    expect(onOpenDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });

  it('opens a dispatch from the keyboard', async () => {
    const user = userEvent.setup();
    const onOpenDispatch = vi.fn();
    renderTimeline({ onOpenDispatch });

    await user.tab();
    await user.keyboard('{Enter}');
    expect(onOpenDispatch).toHaveBeenCalled();
  });

  // An unplaceable window is skipped rather than drawn at the axis origin,
  // where it would read as a real 6am job.
  it('skips a dispatch whose window cannot be placed', () => {
    renderTimeline({
      byTech: {
        u1: [dispatch({ arrivalWindowStart: 'garbage', arrivalWindowEnd: 'garbage' })],
      },
    });
    expect(document.querySelector('.db-block')).toBeNull();
  });
});
