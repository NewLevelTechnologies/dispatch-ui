import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import ServiceLocationDetailPage from './ServiceLocationDetailPage';
import apiClient from '../api/client';
import type { RouteObject } from 'react-router-dom';

vi.mock('../api/client');

const mockCustomer = {
  id: 'customer-1',
  name: 'Test Customer',
  displayMode: 'STANDARD' as const,
  serviceLocations: [
    {
      id: 'location-1',
      customerId: 'customer-1',
      locationName: 'Main Office',
      address: {
        streetAddress: '123 Main St',
        streetAddressLine2: 'Suite 100',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        validated: true,
        isBusiness: true,
      },
      status: 'ACTIVE' as const,
      siteContactName: 'John Doe',
      siteContactPhone: '555-1234',
      siteContactEmail: 'john@example.com',
      accessInstructions: 'Use side entrance',
      notes: 'Important client',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T10:30:00Z',
    },
  ],
};

describe('ServiceLocationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDetailPage = (locationId = 'location-1') => {
    const routes: RouteObject[] = [
      {
        path: '/service-locations/:id',
        element: <ServiceLocationDetailPage />,
      },
    ];

    return renderWithProviders(<ServiceLocationDetailPage />, {
      routes,
      initialPath: `/service-locations/${locationId}`,
    });
  };

  it('displays loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {}));

    renderDetailPage();

    expect(screen.getByText(/loading service location/i)).toBeInTheDocument();
  });

  it('displays error state when fetch fails', async () => {
    const error = new Error('Network error');
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });
  });

  it('displays error state when location not found', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage('non-existent-id');

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });
  });

  it('displays location name and status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('displays customer name with link', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Customer')).toBeInTheDocument();
    });

    const customerLink = screen.getByText('Test Customer');
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('displays full address', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
    });

    expect(screen.getByText('Suite 100')).toBeInTheDocument();
    expect(screen.getByText(/Springfield, IL 62701/)).toBeInTheDocument();
  });

  it('displays address validation badges', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('USPS Validated')).toBeInTheDocument();
    });

    expect(screen.getByText('Business')).toBeInTheDocument();
  });

  it('displays site contact information', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const phoneLink = screen.getByText('555-1234');
    expect(phoneLink).toHaveAttribute('href', 'tel:555-1234');

    const emailLink = screen.getByText('john@example.com');
    expect(emailLink).toHaveAttribute('href', 'mailto:john@example.com');
  });

  it('displays access instructions', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Use side entrance')).toBeInTheDocument();
    });
  });

  it('displays notes', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Important client')).toBeInTheDocument();
    });
  });

  it('displays system metadata', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      // Check system info section exists
      expect(screen.getByText('System Information')).toBeInTheDocument();
    });

    // Check for formatted dates (Created and Last Updated)
    const dates = screen.getAllByText(/Jan \d+, 2024/);
    expect(dates.length).toBeGreaterThan(0);
  });

  it('opens edit dialog when edit button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('handles unnamed location', async () => {
    const customerWithUnnamedLocation = {
      ...mockCustomer,
      serviceLocations: [
        {
          ...mockCustomer.serviceLocations[0],
          locationName: '',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithUnnamedLocation] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Unnamed Location')).toBeInTheDocument();
    });
  });

  it('hides optional sections when data is missing', async () => {
    const minimalCustomer = {
      ...mockCustomer,
      serviceLocations: [
        {
          ...mockCustomer.serviceLocations[0],
          siteContactName: '',
          siteContactPhone: '',
          siteContactEmail: '',
          accessInstructions: '',
          notes: '',
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [minimalCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Optional sections should not be rendered
    expect(screen.queryByText('Site Contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Access Instructions')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });
});
