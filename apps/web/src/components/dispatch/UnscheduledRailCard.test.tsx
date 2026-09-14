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
    serviceLocationCity: 'ATLANTA',
    serviceLocationState: 'GA',
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
