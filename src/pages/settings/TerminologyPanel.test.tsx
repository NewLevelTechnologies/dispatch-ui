import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import TerminologyPanel from './TerminologyPanel';
import apiClient from '../../api/client';

vi.mock('../../api/client');

const mockSettings = {
  tenantId: 't-1',
  companyName: 'Acme',
  primaryColor: '#000',
  secondaryColor: '#fff',
  glossary: {
    customer: { singular: 'Client', plural: 'Clients' },
  },
  updatedAt: '2026-03-27T10:30:00Z',
};

const mockEntities = [
  { code: 'customer', defaultSingular: 'Customer', defaultPlural: 'Customers', description: 'A customer' },
  { code: 'work_order', defaultSingular: 'Work Order', defaultPlural: 'Work Orders', description: 'A work order' },
];

describe('TerminologyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes('/glossary/available')) return Promise.resolve({ data: mockEntities });
      return Promise.resolve({ data: mockSettings });
    });
  });

  it('renders existing customizations in view mode', async () => {
    renderWithProviders(<TerminologyPanel />);

    await waitFor(() => {
      expect(screen.getByText('Client')).toBeInTheDocument();
    });
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('shows empty state when no glossary customizations', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes('/glossary/available')) return Promise.resolve({ data: mockEntities });
      return Promise.resolve({ data: { ...mockSettings, glossary: {} } });
    });

    renderWithProviders(<TerminologyPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no custom terminology/i)).toBeInTheDocument();
    });
  });

  it('switches to edit mode and shows entity inputs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TerminologyPanel />);

    await waitFor(() => expect(screen.getByText('Client')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.getByPlaceholderText('Customer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Customers')).toBeInTheDocument();
  });

  it('submits glossary update', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockSettings });

    renderWithProviders(<TerminologyPanel />);

    await waitFor(() => expect(screen.getByText('Client')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Edit the work_order singular field (currently empty, default Work Order)
    const workOrderSingular = screen.getByPlaceholderText('Work Order');
    await user.type(workOrderSingular, 'Job');

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        expect.stringContaining('/tenant'),
        expect.objectContaining({
          glossary: expect.objectContaining({
            work_order: expect.objectContaining({ singular: 'Job' }),
          }),
        })
      );
    });
  });

  it('reset-to-default button clears the customization', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockSettings });

    renderWithProviders(<TerminologyPanel />);

    await waitFor(() => expect(screen.getByText('Client')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));

    // The customer entity already has a customization (Client/Clients), so the reset icon
    // appears in the customer row. Clicking it clears the customization.
    const resetButtons = screen.getAllByRole('button', { name: /reset/i });
    expect(resetButtons.length).toBeGreaterThan(0);
    await user.click(resetButtons[0]);

    await user.click(screen.getByRole('button', { name: /update/i }));

    // After reset, the glossary submitted should not include the customer entity
    await waitFor(() => {
      const callArg = vi.mocked(apiClient.put).mock.calls[0][1] as { glossary?: Record<string, unknown> };
      expect(callArg.glossary).not.toHaveProperty('customer');
    });
  });

  it('cancel reverts edits without submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TerminologyPanel />);

    await waitFor(() => expect(screen.getByText('Client')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(apiClient.put).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });
});
