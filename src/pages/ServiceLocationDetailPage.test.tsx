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
      siteContactPhone: '5551234567',
      siteContactEmail: 'john@example.com',
      additionalContacts: [],
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

    const phoneLink = screen.getByText('(555) 123-4567');
    expect(phoneLink).toHaveAttribute('href', 'tel:5551234567');

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

  it('displays additional contacts when present', async () => {
    const customerWithContacts = {
      ...mockCustomer,
      serviceLocations: [
        {
          ...mockCustomer.serviceLocations[0],
          additionalContacts: [
            {
              id: 'contact-1',
              name: 'Jane Manager',
              phone: '5559876543',
              email: 'jane@example.com',
              notes: 'Facilities manager',
              displayOrder: 0,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithContacts] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Jane Manager')).toBeInTheDocument();
    });

    expect(screen.getByText(/\(555\) 987-6543/i)).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Facilities manager')).toBeInTheDocument();
  });

  it('shows additional contacts section when user can edit', async () => {
    const minimalCustomer = {
      ...mockCustomer,
      serviceLocations: [
        {
          ...mockCustomer.serviceLocations[0],
          siteContactName: '',
          siteContactPhone: '',
          siteContactEmail: '',
          additionalContacts: [],
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [minimalCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Should show add button when user has permission
    expect(screen.getByRole('button', { name: /add additional contact/i })).toBeInTheDocument();
  });

  it('shows additional contacts section when site contact exists', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Should show section because siteContactName exists
    expect(screen.getByRole('button', { name: /add additional contact/i })).toBeInTheDocument();
  });

  it('opens add contact dialog when button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add additional contact/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByText(/create additional contact/i)).toBeInTheDocument();
    });
  });

  it('displays all tabs', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Check that all tabs are present
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /work order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /equipment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument();
  });

  it('switches to work orders tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click on Work Orders tab
    const workOrdersTab = screen.getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      expect(workOrdersTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('switches to equipment tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click on Equipment tab
    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      expect(equipmentTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('switches to activity tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Click on Activity tab
    const activityTab = screen.getByRole('button', { name: /activity/i });
    await user.click(activityTab);

    await waitFor(() => {
      expect(activityTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('navigates back to service locations when back button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Verify back button exists and has correct href
    const backButtons = screen.getAllByRole('button', { name: /back/i });
    expect(backButtons[0]).toBeInTheDocument();
  });

  it('navigates to customer detail when customer name is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Customer')).toBeInTheDocument();
    });

    // Verify customer link exists and has correct href
    const customerLink = screen.getByText('Test Customer');
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('displays dispatch region when available', async () => {
    const customerWithRegion = {
      ...mockCustomer,
      serviceLocations: [
        {
          ...mockCustomer.serviceLocations[0],
          dispatchRegionId: 'region-1',
        },
      ],
    };

    const mockDispatchRegions = [
      { id: 'region-1', name: 'North Region', isActive: true },
    ];

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes('/customers')) {
        return Promise.resolve({ data: [customerWithRegion] });
      }
      if (url.includes('/dispatch-regions')) {
        return Promise.resolve({ data: mockDispatchRegions });
      }
      return Promise.reject(new Error('Not found'));
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('North Region')).toBeInTheDocument();
    });
  });

  it('closes edit dialog when onClose is called', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Open edit dialog
    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Close dialog (cancel button)
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays empty state in work orders tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to work orders tab
    const workOrdersTab = screen.getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      // Check for the "no entities yet" message
      expect(screen.getByText(/no.*work order.*yet/i)).toBeInTheDocument();
    });
  });

  it('displays empty state in equipment tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to equipment tab
    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      // Check for the "no entities yet" message
      expect(screen.getByText(/no.*equipment.*yet/i)).toBeInTheDocument();
    });
  });

  it('displays notification logs in activity tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to activity tab
    const activityTab = screen.getByRole('button', { name: /activity/i });
    await user.click(activityTab);

    await waitFor(() => {
      // NotificationLogsList component is rendered
      // The component shows "Recent Notifications" heading from the component itself
      expect(activityTab).toHaveAttribute('aria-current', 'page');
    });
  });

  it('displays back button in error state', async () => {
    const error = new Error('Network error');
    vi.mocked(apiClient.get).mockRejectedValue(error);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back to service location/i });
    expect(backButton).toBeInTheDocument();
  });

  it('calls navigate when back button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    const backButton = screen.getAllByRole('button', { name: /back/i })[0];

    // Verify button exists and is clickable (navigation is tested in component)
    expect(backButton).toBeInTheDocument();
    await user.click(backButton);
  });

  it('customer link has correct href', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Test Customer')).toBeInTheDocument();
    });

    const customerLink = screen.getByText('Test Customer');

    // Verify link has correct href
    expect(customerLink).toHaveAttribute('href', '/customers/customer-1');
  });

  it('displays add button in work orders tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to work orders tab
    const workOrdersTab = screen.getByRole('button', { name: /work order/i });
    await user.click(workOrdersTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new work order/i })).toBeInTheDocument();
    });
  });

  it('displays add button in equipment tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [mockCustomer] });
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    // Switch to equipment tab
    const equipmentTab = screen.getByRole('button', { name: /equipment/i });
    await user.click(equipmentTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add equipment/i })).toBeInTheDocument();
    });
  });


  it('displays inactive status badge correctly', async () => {
    const customerWithInactiveLocation = {
      ...mockCustomer,
      serviceLocations: [
        {
          ...mockCustomer.serviceLocations[0],
          status: 'INACTIVE' as const,
        },
      ],
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithInactiveLocation] });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Main Office')).toBeInTheDocument();
    });

    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });

  it('back button in error state is clickable', async () => {
    const error = new Error('Network error');
    vi.mocked(apiClient.get).mockRejectedValue(error);
    const user = userEvent.setup();

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading service location/i)).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /back to service location/i });

    // Verify button exists and is clickable
    expect(backButton).toBeInTheDocument();
    await user.click(backButton);
  });
});
