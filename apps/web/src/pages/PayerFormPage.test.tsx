import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import type { RouteObject } from 'react-router-dom';
import { renderWithProviders, userEvent } from '../test/utils';
import PayerFormPage from './PayerFormPage';
import { apiClient } from '../api/setup';

vi.mock('@dispatch/api/src/client');

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

  it('includes the remit-to address and advanced fields in the create payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'new-payer-1' } });
    renderAddPayer();
    await waitFor(() => screen.getByRole('heading', { name: /add payer/i, level: 1 }));

    fireEvent.change(screen.getByPlaceholderText('American Home Shield'), { target: { value: 'Acme Warranty Co' } });
    // Remit-to address (each field's onChange + setRemit).
    fireEvent.change(screen.getByPlaceholderText('889 Ridge Lake Blvd'), { target: { value: '1 Warranty Way' } });
    fireEvent.change(screen.getByPlaceholderText('Memphis'), { target: { value: 'Chicago' } });
    fireEvent.change(screen.getByDisplayValue('Select...'), { target: { value: 'IL' } });
    fireEvent.change(screen.getByPlaceholderText('38120'), { target: { value: '60601' } });
    // Payment terms select.
    fireEvent.change(screen.getByDisplayValue('Net 30'), { target: { value: '60' } });
    // Advanced section: toggle open, change invoice delivery + billing notes.
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    fireEvent.change(screen.getByDisplayValue('Email'), { target: { value: 'EDI' } });
    fireEvent.change(screen.getByPlaceholderText(/Pre-approval auth/i), { target: { value: 'Cap $480' } });

    fireEvent.click(screen.getByRole('button', { name: /add payer/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({
          name: 'Acme Warranty Co',
          type: 'BILLING_ONLY',
          paymentTermsDays: 60,
          invoiceDeliveryMethod: 'EDI',
          notes: 'Cap $480',
          billingAddress: { streetAddress: '1 Warranty Way', city: 'Chicago', state: 'IL', zipCode: '60601' },
        })
      )
    );
  });

  it('chains an Escalation contact when the escalation name is filled', async () => {
    vi.mocked(apiClient.post).mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/customers' ? { id: 'p-2' } : {} })
    );
    renderAddPayer();
    await waitFor(() => screen.getByRole('heading', { name: /add payer/i, level: 1 }));

    fireEvent.change(screen.getByPlaceholderText('American Home Shield'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    fireEvent.change(screen.getByPlaceholderText('R. Pratt · Network Mgr'), { target: { value: 'Rae Pratt' } });
    fireEvent.change(screen.getByPlaceholderText('escalations@payer.com'), { target: { value: 'esc@acme.com' } });

    fireEvent.click(screen.getByRole('button', { name: /add payer/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers/p-2/contacts',
        expect.objectContaining({ name: 'Rae Pratt', role: 'Escalation', email: 'esc@acme.com' })
      )
    );
  });

  it('shows the duplicate guard on a name match and dismisses it', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith('/customers/payers/search'))
        return Promise.resolve({ data: { content: [{ id: 'dup-1', name: 'Acme Warranty Co', customerNumber: 'C-1' }] } });
      if (url.startsWith('/users')) return Promise.resolve({ data: { content: [] } });
      return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });
    renderAddPayer();
    await waitFor(() => screen.getByRole('heading', { name: /add payer/i, level: 1 }));

    fireEvent.change(screen.getByPlaceholderText('American Home Shield'), { target: { value: 'Acme' } });

    // Debounced (250ms) payer-name search surfaces the match.
    expect(await screen.findByText(/already exists/i, undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /not a duplicate/i }));
    await waitFor(() => expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument());
  });

  it('flags an invalid AP email on blur', async () => {
    renderAddPayer();
    await waitFor(() => screen.getByRole('heading', { name: /add payer/i, level: 1 }));

    // The error surfaces on blur (touched). Submit is moot here — the type=email
    // field's native constraint validation blocks the form before our JS runs.
    const apEmail = screen.getByPlaceholderText('claims-ap@payer.com');
    fireEvent.change(apEmail, { target: { value: 'not-an-email' } });
    fireEvent.blur(apEmail);

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('stays on the form (does not navigate) when create fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));
    renderAddPayer();
    await waitFor(() => screen.getByRole('heading', { name: /add payer/i, level: 1 }));

    fireEvent.change(screen.getByPlaceholderText('American Home Shield'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /add payer/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(screen.queryByText('Payer detail')).not.toBeInTheDocument();
  });

  it('attaches the chosen account manager to the create payload', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.startsWith('/users/assignable'))
        return Promise.resolve({
          data: { content: [{ id: 'u-7', firstName: 'Marco', lastName: 'Castillo', email: 'm@co.com' }] },
        });
      if (url.startsWith('/customers/payers/search')) return Promise.resolve({ data: { content: [] } });
      return Promise.reject(new Error(`Unknown endpoint: ${url}`));
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 'p-3' } });
    renderAddPayer();
    await waitFor(() => screen.getByRole('heading', { name: /add payer/i, level: 1 }));

    fireEvent.change(screen.getByPlaceholderText('American Home Shield'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    // Open the account-manager picker (fetches on focus) and select a user.
    fireEvent.focus(screen.getByPlaceholderText('Search users…'));
    fireEvent.click(await screen.findByText('Marco Castillo', undefined, { timeout: 3000 }));

    fireEvent.click(screen.getByRole('button', { name: /add payer/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({ accountManagerUserId: 'u-7' })
      )
    );
  });
});
