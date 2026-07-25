import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { SiteInstructionsCard } from './ServiceLocationDetailPage';
import apiClient from '../api/client';
import type { ArrivalFactDto } from '../api/arrivalFactApi';
import type { ServiceLocationDetailDto } from '../api';

vi.mock('../api/client');

// The arrival-facts list query seeds from location.arrivalFacts (initialData)
// then refetches the endpoint. Keep the GET in lockstep with the seed so the
// refetch doesn't blank the rows mid-test.
let listedFacts: ArrivalFactDto[] = [];

const fact = (over: Partial<ArrivalFactDto> = {}): ArrivalFactDto => ({
  id: 'fact-1',
  label: 'Parking',
  value: 'Lot B',
  mono: false,
  multiline: false,
  authorName: 'Jane CSR',
  authorUserId: 'u-1',
  displayOrder: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  ...over,
});

const loc = (over: Partial<ServiceLocationDetailDto> = {}): ServiceLocationDetailDto =>
  ({
    id: 'location-1',
    customerId: 'customer-1',
    premiseType: 'BUSINESS',
    locationName: 'Main Office',
    arrivalFacts: [],
    accessInstructions: null,
    profileImageUrl: null,
    ...over,
  }) as unknown as ServiceLocationDetailDto;

const renderCard = (location: ServiceLocationDetailDto) => {
  listedFacts = location.arrivalFacts ?? [];
  return renderWithProviders(<SiteInstructionsCard location={location} canEdit />);
};

describe('SiteInstructionsCard (arrival facts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('suggested-labels')) {
        return Promise.resolve({ data: ['Gate code', 'Parking', 'Lockbox'] } as never);
      }
      return Promise.resolve({ data: listedFacts } as never);
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  });

  it('renders facts + arrival prose, masks a sensitive value, and reveals it', async () => {
    const user = userEvent.setup();
    renderCard(
      loc({
        arrivalFacts: [fact(), fact({ id: 'fact-2', label: 'Gate code', value: '1234', mono: true })],
        accessInstructions: 'Use side gate',
      })
    );

    expect(await screen.findByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Lot B')).toBeInTheDocument();
    expect(screen.getByText('Use side gate')).toBeInTheDocument();
    // Sensitive "Gate code" is masked until revealed.
    expect(screen.getByText('••••••')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('adds a field via + Add field', async () => {
    const user = userEvent.setup();
    renderCard(loc({ arrivalFacts: [] }));

    await user.click(screen.getByText('+ Add field'));
    await user.type(screen.getByLabelText('Label'), 'Lockbox');
    await user.type(screen.getByPlaceholderText('Value'), '4455');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/service-locations/location-1/arrival-facts',
        expect.objectContaining({ label: 'Lockbox', value: '4455' })
      )
    );
  });

  it('edits an existing fact inline', async () => {
    const user = userEvent.setup();
    renderCard(loc({ arrivalFacts: [fact()] }));

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const value = screen.getByPlaceholderText('Value');
    await user.clear(value);
    await user.type(value, 'Lot C');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/arrival-facts/fact-1',
        expect.objectContaining({ label: 'Parking', value: 'Lot C' })
      )
    );
  });

  it('deletes a non-sensitive fact directly (no confirm)', async () => {
    const user = userEvent.setup();
    renderCard(loc({ arrivalFacts: [fact()] }));

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/arrival-facts/fact-1'));
  });

  it('confirms before deleting a sensitive fact', async () => {
    const user = userEvent.setup();
    renderCard(loc({ arrivalFacts: [fact({ id: 'fact-2', label: 'Gate code', value: '1234', mono: true })] }));

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/arrival-facts/fact-2'));
  });

  it('edits the arrival prose (Before you arrive) and PUTs accessInstructions', async () => {
    const user = userEvent.setup();
    renderCard(loc({ arrivalFacts: [], accessInstructions: 'Use side gate' }));

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Park in rear');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        '/service-locations/location-1',
        expect.objectContaining({ accessInstructions: 'Park in rear' })
      )
    );
  });
});
