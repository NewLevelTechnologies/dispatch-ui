import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import CustomersPage from './CustomersPage';
import apiClient from '../api/client';

// Mock the API client
vi.mock('../api/client');

const mockCustomers = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-1234',
    address: '123 Main St',
    city: 'Boston',
    state: 'MA',
    zipCode: '02101',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '555-5678',
    address: '456 Oak Ave',
    city: 'Cambridge',
    state: 'MA',
    zipCode: '02139',
  },
];

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title and add button', () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<CustomersPage />);

    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add customer/i })).toBeInTheDocument();
  });

  it('displays loading state while fetching customers', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(<CustomersPage />);

    expect(screen.getByText('Loading customers...')).toBeInTheDocument();
  });

  it('displays customers in a table', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('555-1234')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText(/error loading customers/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no customers exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });
  });

  it('opens create dialog when add button is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('No customers found')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add customer/i });
    await user.click(addButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Add Customer').length).toBeGreaterThan(0);
  });

  it('displays customer location in correct format', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: mockCustomers });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Boston, MA')).toBeInTheDocument();
    });

    expect(screen.getByText('Cambridge, MA')).toBeInTheDocument();
  });

  it('displays dash when location fields are missing', async () => {
    const customerWithoutLocation = {
      ...mockCustomers[0],
      city: undefined,
      state: undefined,
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: [customerWithoutLocation] });

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Table should show dash for missing location
    const dashElements = screen.getAllByText('-');
    expect(dashElements.length).toBeGreaterThan(0);
  });
});
