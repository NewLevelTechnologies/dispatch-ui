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

// The rail is the densest element on the board, so its third line has to earn
// the slot. "Atlanta · Georgia" is the city and the REGION name — for a
// single-metro tenant both are constants on every card.
describe('UnscheduledRailCard — where the job is', () => {
  it('shows the street, which is what tells two jobs apart', () => {
    renderCard({
      workOrder: workOrder({ serviceLocationStreet: '1847 PEACHTREE RD NE' }),
    });
    expect(screen.getByText(/1847 Peachtree Rd NE/)).toBeInTheDocument();
  });

  it('keeps directionals uppercase and title-cases the rest', () => {
    renderCard({ workOrder: workOrder({ serviceLocationStreet: '12 SW MAIN ST' }) });
    expect(screen.getByText(/12 SW Main St/)).toBeInTheDocument();
  });

  it('does not spend the slot on the city once the street is there', () => {
    renderCard({
      workOrder: workOrder({ serviceLocationStreet: '1847 PEACHTREE RD NE' }),
      regionName: 'Georgia',
    });
    expect(screen.queryByText(/Atlanta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Georgia/)).not.toBeInTheDocument();
  });

  it('falls back to the old city line when the site has no street on file', () => {
    // Null means "no street recorded", not "lookup failed" — so the card
    // shows what it always showed rather than a gap or a placeholder.
    renderCard({ workOrder: workOrder({ serviceLocationStreet: null }), regionName: 'Georgia' });
    expect(screen.getByText(/Atlanta · Georgia/)).toBeInTheDocument();
  });

  it('never promotes zip into the street slot', () => {
    // Zip separates same-named streets across a metro — a tooltip's job, not
    // a 262px card's.
    renderCard({
      workOrder: workOrder({ serviceLocationStreet: null, serviceLocationZip: '30309' }),
    });
    expect(screen.queryByText(/30309/)).not.toBeInTheDocument();
  });

  it('still drops a region that merely repeats the city', () => {
    renderCard({ workOrder: workOrder({ serviceLocationStreet: null }), regionName: 'Atlanta' });
    expect(screen.getByText('Atlanta')).toBeInTheDocument();
    expect(screen.queryByText(/Atlanta · Atlanta/)).not.toBeInTheDocument();
  });
});
