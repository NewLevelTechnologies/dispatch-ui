import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, userEvent } from '../../test/utils';
import { renderWithProviders } from '../../test/utils';
import AgreementCoverageTab from './AgreementCoverageTab';
import { agreementApi, type CoverageResponse, type ServiceLocation } from '../../api';
import type { LocationMap } from './agreementShared';

vi.mock('../../api', () => ({
  agreementApi: {
    getCoverage: vi.fn(),
    addCoverageLocations: vi.fn(),
    removeCoverageLocation: vi.fn(),
  },
  customerApi: { getServiceLocations: vi.fn() },
}));

const coverage: CoverageResponse = {
  agreementId: 'a-1',
  selectorMode: 'TAG',
  selectorTagId: null,
  autoAdd: true,
  locationCount: 2,
  memberships: [
    { id: 'm1', serviceLocationId: 'sl1', effectiveCoverageStart: '2026-01-01', source: 'TAG_SEEDED', addedAt: '' },
    { id: 'm2', serviceLocationId: 'sl2', effectiveCoverageStart: '2026-02-01', source: 'MANUAL', addedAt: '' },
  ],
};

const loc = (id: string, name: string, city: string): ServiceLocation =>
  ({ id, locationName: name, address: { city, state: 'AZ', streetAddress: '', zipCode: '' } }) as unknown as ServiceLocation;

// sl1/sl2 are covered; sl3 is available to add.
const locationMap: LocationMap = new Map([
  ['sl1', loc('sl1', 'Retail #001', 'Scottsdale')],
  ['sl2', loc('sl2', 'Retail #047', 'Tempe')],
  ['sl3', loc('sl3', 'Retail #112', 'Chandler')],
]);

function render() {
  return renderWithProviders(
    <AgreementCoverageTab agreementId="a-1" customerLocationCount={3} locationMap={locationMap} />,
  );
}

describe('AgreementCoverageTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementApi.getCoverage).mockResolvedValue(coverage);
    vi.mocked(agreementApi.removeCoverageLocation).mockResolvedValue(coverage);
    vi.mocked(agreementApi.addCoverageLocations).mockResolvedValue(coverage);
  });

  it('renders membership rows with provenance and removes a location', async () => {
    render();
    expect(await screen.findByText('Retail #001')).toBeInTheDocument();
    expect(screen.getByText('Tag rule')).toBeInTheDocument();
    expect(screen.getByText('Added manually')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Remove Retail #001 from coverage/i }));
    await waitFor(() => expect(agreementApi.removeCoverageLocation).toHaveBeenCalledWith('a-1', 'sl1'));
  });

  it('adds an uncovered location from the Add dialog', async () => {
    render();
    await screen.findByText('Retail #001');

    await userEvent.click(screen.getByRole('button', { name: /^add locations$/i }));
    // Only the uncovered location (sl3) is offered.
    expect(await screen.findByText('Retail #112')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /^add 1$/i }));

    await waitFor(() =>
      expect(agreementApi.addCoverageLocations).toHaveBeenCalledWith('a-1', { serviceLocationIds: ['sl3'] }),
    );
  });
});
