import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { SiteContactCard } from './ServiceLocationDetailPage';
import { apiClient } from '../api/setup';
import type { AdditionalContact, ServiceLocationDetailDto } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const contact = (over: Partial<AdditionalContact>): AdditionalContact =>
  ({
    id: 'contact-1',
    name: 'Primary Contact',
    phone: '5551110000',
    email: 'primary@example.com',
    role: 'Manager',
    isPrimary: true,
    displayOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...over,
  }) as unknown as AdditionalContact;

const location = {
  id: 'location-1',
  customerId: 'customer-1',
  premiseType: 'BUSINESS',
  locationName: 'Main Office',
} as unknown as ServiceLocationDetailDto;

let contacts: AdditionalContact[] = [];

describe('SiteContactCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contacts = [
      contact({}),
      contact({ id: 'contact-2', name: 'Backup Contact', isPrimary: false, displayOrder: 1 }),
    ];
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (typeof url === 'string' && url.endsWith('/contacts')) {
        return Promise.resolve({ data: contacts } as never);
      }
      // NotifBell reads contact notification prefs — must be an array.
      return Promise.resolve({ data: [] } as never);
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.delete).mockResolvedValue({ data: {} } as never);
  });

  it('renders the primary and additional contacts', async () => {
    renderWithProviders(<SiteContactCard location={location} canEdit onViewAll={vi.fn()} />);
    expect(await screen.findByText('Primary Contact')).toBeInTheDocument();
    expect(screen.getByText('Backup Contact')).toBeInTheDocument();
  });

  it('promotes an additional contact to primary', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteContactCard location={location} canEdit onViewAll={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /make primary/i }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/service-locations/location-1/contacts/contact-2/make-primary')
    );
  });
});
