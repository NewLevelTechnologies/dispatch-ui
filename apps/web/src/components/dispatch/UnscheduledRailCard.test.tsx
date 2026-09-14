import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnscheduledRailCard from './UnscheduledRailCard';
import type { UnscheduledWorkOrder } from '../../api/setup';

function workOrder(over: Partial<UnscheduledWorkOrder> = {}): UnscheduledWorkOrder {
  return {
    workOrderId: 'wo-1',
    workOrderNumber: 'WO-3911',
    workOrderSummary: 'No cooling',
    workOrderTypeId: null,
    customerId: 'c1',
    customerName: 'Pham, A.',
    serviceLocationId: 'l1',
    serviceLocationName: null,
    serviceLocationStreet: null,
    serviceLocationCity: 'ATLANTA',
    serviceLocationState: 'GA',
    serviceLocationZip: null,
    latitude: 33.75,
    longitude: -84.39,
    priority: 'NORMAL',
    itemCount: 1,
    recurring: false,
    dispatchRegionId: null,
    divisionId: null,
    createdAt: '2026-03-15T09:00:00Z',
    ...over,
  };
}

function renderCard(over: Partial<React.ComponentProps<typeof UnscheduledRailCard>> = {}) {
  return render(
    <UnscheduledRailCard
      workOrder={workOrder()}
      regionName={null}
      divisionName={null}
      workOrderHref={(id) => `/work-orders/${id}`}
      onOpen={vi.fn()}
      {...over}
    />,
  );
}

// The rail and the map render the same jobs twice. Without a link between
// them a dispatcher can read a 95-day-old card and not know where it is, and
// see something unscheduled near East Point and not know what it is.
describe('UnscheduledRailCard — cross-surface hover', () => {
  it('reports the job being pointed at, so its pin can grow', async () => {
    const onHover = vi.fn();
    const user = userEvent.setup();
    renderCard({ onHover });

    await user.hover(screen.getByRole('button'));
    expect(onHover).toHaveBeenCalledWith('wo-1');
  });

  it('reports the release, so the pin returns to normal', async () => {
    const onHover = vi.fn();
    const user = userEvent.setup();
    renderCard({ onHover });

    await user.hover(screen.getByRole('button'));
    await user.unhover(screen.getByRole('button'));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('reaches the same link from the keyboard', async () => {
    // A dispatcher tabbing the rail gets the same map feedback a mouse gives.
    const onHover = vi.fn();
    const user = userEvent.setup();
    renderCard({ onHover });

    await user.tab();
    expect(onHover).toHaveBeenCalledWith('wo-1');
  });

  it('highlights when the pointing happened on the MAP instead', () => {
    // Symmetry: one hover id owned by the page drives both directions, so the
    // card lights up from a pin hover exactly as the pin does from a card.
    renderCard({ hovered: true });
    expect(screen.getByRole('button').className).toContain('hot');
  });

  it('is not highlighted otherwise', () => {
    renderCard();
    expect(screen.getByRole('button').className).not.toContain('hot');
  });

  it('works with no hover handler at all', async () => {
    // The card predates the map and is still rendered without one.
    const user = userEvent.setup();
    renderCard({ onHover: undefined });
    await expect(user.hover(screen.getByRole('button'))).resolves.not.toThrow();
  });
});

// The rail is the densest element on the board, so its lines have to earn the
// slot — and its SHAPE has to stay constant, because scanning a queue depends
// on the same datum sitting in the same place on every card.
describe('UnscheduledRailCard — where the job is', () => {
  const located = {
    serviceLocationName: null,
    serviceLocationStreet: '1847 PEACHTREE RD NE',
    serviceLocationCity: 'ATLANTA',
    serviceLocationState: 'GA',
    serviceLocationZip: '30309',
  };

  it('prints the complete address, not just the street', () => {
    renderCard({ workOrder: workOrder(located) });
    expect(screen.getByText('1847 Peachtree Rd NE · Atlanta, GA 30309')).toBeInTheDocument();
  });

  it('keeps directionals uppercase and the state code uppercase', () => {
    renderCard({ workOrder: workOrder({ ...located, serviceLocationStreet: '12 SW MAIN ST' }) });
    expect(screen.getByText(/12 SW Main St/)).toBeInTheDocument();
    expect(screen.getByText(/GA 30309/)).toBeInTheDocument();
  });

  it('still prints city and state when the site has no street on file', () => {
    // The shape does not change with the content: a card missing a street
    // shows the place it knows, in the same slot, rather than a shorter card.
    renderCard({ workOrder: workOrder({ ...located, serviceLocationStreet: null }) });
    expect(screen.getByText('Atlanta, GA 30309')).toBeInTheDocument();
  });

  it('leaves no dangling separator when parts are missing', () => {
    renderCard({
      workOrder: workOrder({ ...located, serviceLocationStreet: null, serviceLocationZip: null }),
    });
    expect(screen.getByText('Atlanta, GA')).toBeInTheDocument();
  });

  it('keeps the region OFF the address line', () => {
    // Region is scope metadata, not a piece of the address — a different kind
    // of fact, not a shorter version of the same one.
    renderCard({ workOrder: workOrder(located), regionName: 'Georgia' });
    expect(screen.getByText('1847 Peachtree Rd NE · Atlanta, GA 30309')).toBeInTheDocument();
    expect(screen.getByText('Georgia')).toBeInTheDocument();
  });

  it('no longer suppresses a region that matches the city', () => {
    // The old guard lived on the address line where the duplication was
    // possible. On the meta row beside division it cannot occur, and a
    // content-dependent guard on a card's shape costs more than it saves.
    renderCard({ workOrder: workOrder(located), regionName: 'Atlanta' });
    expect(screen.getByText('Atlanta')).toBeInTheDocument();
  });
});

// Each element self-hides independently, and on many tenants the row never
// renders at all — which is what keeps the address line's extra line
// affordable against a budget of ~5 visible cards.
describe('UnscheduledRailCard — the conditional meta row', () => {
  it('is absent entirely when nothing applies', () => {
    const { container } = renderCard({
      workOrder: workOrder({ itemCount: 1 }),
      regionName: null,
      divisionName: null,
    });
    // Never an empty spacer to keep heights uniform: reach down the queue is
    // worth more than uniformity, and these conditions are tenant-level, so
    // the cards stay uniform anyway.
    expect(container.querySelector('.mt-3')).toBeNull();
  });

  it('renders for division alone', () => {
    renderCard({ divisionName: 'HVAC' });
    expect(screen.getByText('HVAC')).toBeInTheDocument();
  });

  it('separates division and region when both apply', () => {
    renderCard({ divisionName: 'HVAC', regionName: 'East Valley' });
    expect(screen.getByText('HVAC')).toBeInTheDocument();
    expect(screen.getByText('East Valley')).toBeInTheDocument();
  });

  it('says the item count only when it implies more than one visit', () => {
    renderCard({ workOrder: workOrder({ itemCount: 1 }) });
    expect(screen.queryByText(/item/)).not.toBeInTheDocument();

    renderCard({ workOrder: workOrder({ itemCount: 3 }) });
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });
});

// What the board routes TO. "Kroger Co." on eleven cards is eleven different
// stores; "Store #4412" is the one the truck is going to.
describe('UnscheduledRailCard — what the job is called', () => {
  it('names the site when the site has a name', () => {
    renderCard({
      workOrder: workOrder({ serviceLocationName: 'Store #4412', customerName: 'Kroger Co.' }),
    });
    expect(screen.getByText('Store #4412')).toBeInTheDocument();
    expect(screen.queryByText('Kroger Co.')).not.toBeInTheDocument();
  });

  it('falls back to the customer when it does not — most houses have no name', () => {
    renderCard({
      workOrder: workOrder({ serviceLocationName: null, customerName: 'Pham, A.' }),
    });
    expect(screen.getByText('Pham, A.')).toBeInTheDocument();
  });

  it('falls back on an empty name too, rather than rendering a blank line', () => {
    renderCard({ workOrder: workOrder({ serviceLocationName: '', customerName: 'Pham, A.' }) });
    expect(screen.getByText('Pham, A.')).toBeInTheDocument();
  });

  it('renders a job whose location has no cache row at all', () => {
    // Live case since the join fix: such a job used to vanish from the board
    // entirely. It now appears with the customer name, no address and no pin —
    // degraded, visible, correct.
    const { container } = renderCard({
      workOrder: workOrder({
        serviceLocationName: null,
        serviceLocationStreet: null,
        serviceLocationCity: '',
        serviceLocationState: '',
        serviceLocationZip: null,
        latitude: null,
        longitude: null,
        customerName: 'Pham, A.',
      }),
    });
    expect(screen.getByText('Pham, A.')).toBeInTheDocument();
    // No empty address element holding layout, and no placeholder.
    expect(container.querySelector('.db-wo-addr')).toBeNull();
    expect(screen.queryByText(/N\/A|unknown/i)).not.toBeInTheDocument();
  });
});
