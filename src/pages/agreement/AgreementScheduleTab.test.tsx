import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/utils';
import AgreementScheduleTab from './AgreementScheduleTab';
import {
  agreementApi,
  dispatchesApi,
  type AgreementVisitResponse,
  type DispatchBoardRow,
  type ServiceLocation,
} from '../../api';
import type { LocationMap } from './agreementShared';

vi.mock('../../api', () => ({
  agreementApi: { getVisits: vi.fn() },
  dispatchesApi: { listForWorkOrder: vi.fn() },
}));

const materialized: AgreementVisitResponse = {
  obligationId: 'o1',
  visitTemplateId: 'vt1',
  visitTemplateLabel: 'Quarterly PM',
  serviceLocationId: 'sl1',
  periodKey: '2026-Q3',
  windowStart: '2026-07-01',
  windowEnd: '2026-07-30',
  status: 'SCHEDULED',
  workOrderId: 'wo1',
};
const expected: AgreementVisitResponse = {
  obligationId: 'o2',
  visitTemplateId: 'vt1',
  visitTemplateLabel: 'Quarterly PM',
  serviceLocationId: 'sl2',
  periodKey: '2026-Q4',
  windowStart: '2026-10-01',
  windowEnd: '2026-10-30',
  status: 'EXPECTED',
  workOrderId: null,
};

const dispatch = {
  id: 'd1',
  workOrderId: 'wo1',
  arrivalWindowStart: '2026-07-14T16:30:00Z',
  arrivalWindowEnd: '2026-07-14T18:00:00Z',
  status: 'SCHEDULED',
  assignedUserName: 'D. Park',
  workOrderNumber: 'WO-4220',
} as unknown as DispatchBoardRow;

const loc = (id: string, name: string, city: string): ServiceLocation =>
  ({ id, locationName: name, address: { city, state: 'AZ', streetAddress: '', zipCode: '' } }) as unknown as ServiceLocation;

const locationMap: LocationMap = new Map([
  ['sl1', loc('sl1', 'Retail #001', 'Scottsdale')],
  ['sl2', loc('sl2', 'Retail #047', 'Tempe')],
]);

describe('AgreementScheduleTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementApi.getVisits).mockImplementation((_id, params) =>
      Promise.resolve(params?.when === 'recent' ? [] : [materialized, expected]),
    );
    vi.mocked(dispatchesApi.listForWorkOrder).mockResolvedValue([dispatch]);
  });

  it('shows materialized visits enriched with dispatch tech + ungenerated obligations', async () => {
    renderWithProviders(<AgreementScheduleTab agreementId="a-1" locationMap={locationMap} />);

    // Tier 1 — a real work order, enriched with its dispatch tech + location.
    expect(await screen.findByText('WO-4220')).toBeInTheDocument();
    expect(screen.getByText('D. Park')).toBeInTheDocument();
    expect(screen.getByText('Retail #001')).toBeInTheDocument();

    // Tier 2 — the ungenerated obligation, grouped by its period.
    expect(screen.getByText('2026-Q4')).toBeInTheDocument();
    expect(screen.getByText(/Scheduled later/i)).toBeInTheDocument();
  });
});
