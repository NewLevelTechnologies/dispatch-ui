import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import PayerFormPage from './PayerFormPage';
import apiClient from '../api/client';

vi.mock('../api/client');

function mockGets() {
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    if (url.startsWith('/users')) return Promise.resolve({ data: { content: [] } });
    if (url.startsWith('/customers/payers/search')) return Promise.resolve({ data: { content: [] } });
    return Promise.reject(new Error(`Unknown endpoint: ${url}`));
  });
}

function renderAddPayer() {
  const routes: RouteObject[] = [
    { path: '/payers/new', element: <PayerFormPage /> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '/customers/:id', element: <div>Payer detail</div> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '/payers', element: <div>Payers list</div> },
    // eslint-disable-next-line i18next/no-literal-string
    { path: '*', element: <div>Elsewhere</div> },
  ];
  return renderWithProviders(<PayerFormPage />, { routes, initialEntries: ['/payers/new'] });
}

describe('PayerFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGets();
  });

  it('renders the add-payer heading', async () => {
    renderAddPayer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add payer/i, level: 1 })).toBeInTheDocument();
    });
  });

  it('does not submit when the name is empty', async () => {
    const user = userEvent.setup();
    renderAddPayer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add payer/i, level: 1 })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add payer/i }));

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('creates a BILLING_ONLY customer with no service location from just a name', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'new-payer-1' } });
    renderAddPayer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add payer/i, level: 1 })).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('American Home Shield'), 'Acme Warranty Co');
    await user.click(screen.getByRole('button', { name: /add payer/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({
          name: 'Acme Warranty Co',
          type: 'BILLING_ONLY',
          serviceLocations: [],
        })
      );
    });
  });

  it('chains an Accounts Payable contact when the AP name is filled', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockImplementation((url: string) => {
      if (url === '/customers') return Promise.resolve({ data: { id: 'new-payer-1' } });
      return Promise.resolve({ data: {} });
    });
    renderAddPayer();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add payer/i, level: 1 })).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('American Home Shield'), 'Acme Warranty Co');
    await user.type(screen.getByPlaceholderText('Linda Chen'), 'Linda Chen');
    await user.click(screen.getByRole('button', { name: /add payer/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers/new-payer-1/contacts',
        expect.objectContaining({ name: 'Linda Chen', role: 'Accounts Payable' })
      );
    });
  });
});
