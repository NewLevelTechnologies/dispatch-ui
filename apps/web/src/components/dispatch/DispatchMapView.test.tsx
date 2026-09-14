import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DispatchMapView from './DispatchMapView';
import type { BoardDispatch, BoardTech, UnscheduledWorkOrder } from '../../api/setup';

// The renderer needs WebGL, which jsdom does not have. Stubbing it keeps
// these tests about the surface AROUND the map — which is the part that has
// to be right before a basemap exists at all.
const canvasProps = vi.fn();
vi.mock('./DispatchMapCanvas', () => ({
  default: (props: Record<string, unknown>) => {
    canvasProps(props);
    return <div data-testid="dispatch-map-canvas" />;
  },
}));

vi.mock('../ThemeProvider', () => ({ useTheme: () => ({ mode: 'light' }) }));

function tech(over: Partial<BoardTech> = {}): BoardTech {
  return { id: 'u1', name: 'Jordan Wei', regionIds: [], primaryRegionId: null, stopCount: 1, ...over };
}

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
    serviceLocationCity: 'Phoenix',
    serviceLocationState: 'AZ',
    serviceLocationZip: null,
    latitude: 33.45,
    longitude: -112.07,
    priority: 'NORMAL',
    itemCount: 1,
    recurring: false,
    dispatchRegionId: null,
    divisionId: null,
    createdAt: '2026-03-15T09:00:00Z',
    ...over,
  };
}

function renderMap(over: Partial<React.ComponentProps<typeof DispatchMapView>> = {}) {
  const byTech: Record<string, BoardDispatch[]> = {};
  return render(
    <DispatchMapView
      techs={[tech()]}
      byTech={byTech}
      unscheduled={[workOrder()]}
      unscheduledTotal={1}
      missingCoordinates={0}
      selectedId={null}
      onOpenDispatch={vi.fn()}
      onAssign={vi.fn()}
      onOpenUnassigned={vi.fn()}
      hoverWorkOrderId={null}
      onHoverWorkOrder={vi.fn()}
      scopeKey="2026-03-15||"
      {...over}
    />,
  );
}

beforeEach(() => canvasProps.mockClear());
afterEach(() => vi.unstubAllEnvs());

describe('when no basemap is configured', () => {
  beforeEach(() => vi.stubEnv('VITE_MAP_STYLE_URL', ''));

  it('says so explicitly rather than showing a blank canvas', async () => {
    renderMap();
    expect(await screen.findByText("The map isn't configured yet")).toBeInTheDocument();
  });

  it('never reaches for the renderer, so no one downloads a map engine to be told there is no map', () => {
    renderMap();
    expect(screen.queryByTestId('dispatch-map-canvas')).not.toBeInTheDocument();
    expect(canvasProps).not.toHaveBeenCalled();
  });
});

describe('when a basemap is configured', () => {
  beforeEach(() => vi.stubEnv('VITE_MAP_STYLE_URL', 'https://cdn.example.com/tiles/base.pmtiles'));

  it('renders the map surface', async () => {
    renderMap();
    expect(await screen.findByTestId('dispatch-map-canvas')).toBeInTheDocument();
  });

  it('defaults routes to the focused technician only — sixty at once is unreadable', async () => {
    renderMap();
    await screen.findByTestId('dispatch-map-canvas');
    expect(canvasProps).toHaveBeenCalledWith(expect.objectContaining({ routes: 'selected' }));
  });

  it('counts dispatches whose site never geocoded, rather than dropping them silently', async () => {
    renderMap({ missingCoordinates: 3 });
    expect(await screen.findByText('3 jobs have no location')).toBeInTheDocument();
  });

  it('counts unassigned work with no location SEPARATELY — different cause, different fix', async () => {
    renderMap({
      unscheduled: [workOrder(), workOrder({ workOrderId: 'wo-2', latitude: null, longitude: null })],
      unscheduledTotal: 2,
    });
    // The plural reads oddly because the test dictionary carries one form;
    // production has _one/_other and renders "1 unassigned job".
    expect(await screen.findByText('1 unassigned jobs have no location')).toBeInTheDocument();
  });

  it('admits when the rail page did not reach every unassigned job', async () => {
    // 50 dashed pins look like all of them in a way a scrolling list never
    // does, so the shortfall has to be stated.
    renderMap({ unscheduledTotal: 83, unscheduled: [workOrder()] });
    expect(await screen.findByText('Showing 1 of 83 unassigned')).toBeInTheDocument();
  });

  it('stays quiet when nothing is missing', async () => {
    renderMap();
    await screen.findByTestId('dispatch-map-canvas');
    expect(screen.queryByText(/has no location/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it('reframes on a fit request but NOT on a layer toggle', async () => {
    const user = userEvent.setup();
    renderMap();
    await screen.findByTestId('dispatch-map-canvas');
    const fitBefore = canvasProps.mock.lastCall?.[0].fitSignal;

    // A layer toggle must not move the viewport — the dispatcher's panning
    // is theirs to keep.
    await user.click(screen.getByRole('button', { name: /Unassigned/ }));
    expect(canvasProps.mock.lastCall?.[0].fitSignal).toBe(fitBefore);
    expect(canvasProps.mock.lastCall?.[0].showUnassigned).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Fit to work' }));
    expect(canvasProps.mock.lastCall?.[0].fitSignal).toBe(fitBefore + 1);
  });

  it('offers no way to clear a focus that is not set', async () => {
    renderMap();
    await screen.findByTestId('dispatch-map-canvas');
    expect(screen.queryByRole('button', { name: 'Clear focus' })).not.toBeInTheDocument();
  });
});
