import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import ServiceLocationContactDialog from './ServiceLocationContactDialog';
import { apiClient } from '../api/setup';
import type { AdditionalContact } from '../api/setup';

vi.mock('@dispatch/api/src/client');

const locationId = 'loc-1';

const existingContact: AdditionalContact = {
  id: 'c-1',
  name: 'Jane Manager',
  role: 'Property manager',
  phone: '5551110000',
  mobilePhone: '5552220000',
  afterHoursPhone: null,
  email: 'jane@acme.com',
  notes: 'Roof access via east stairwell',
  displayOrder: 1,
  isPrimary: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('ServiceLocationContactDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
  });

  it('renders an empty create form', () => {
    renderWithProviders(
      <ServiceLocationContactDialog isOpen onClose={vi.fn()} locationId={locationId} contact={null} queryKey={['x']} />
    );
    expect(screen.getByText('Create Additional Contact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    // Create mode never offers Delete.
    expect(screen.queryByRole('button', { name: /delete contact/i })).not.toBeInTheDocument();
  });

  it('pre-fills in edit mode and shows Delete when deletable', () => {
    renderWithProviders(
      <ServiceLocationContactDialog
        isOpen
        onClose={vi.fn()}
        locationId={locationId}
        contact={existingContact}
        queryKey={['x']}
        onRequestDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Edit Additional Contact')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Jane Manager')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@acme.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete contact/i })).toBeInTheDocument();
  });

  it('validates that name is required and does not submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceLocationContactDialog isOpen onClose={vi.fn()} locationId={locationId} contact={null} queryKey={['x']} />
    );
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument());
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates a contact with the entered fields', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ServiceLocationContactDialog isOpen onClose={onClose} locationId={locationId} contact={null} queryKey={['x']} />
    );

    await user.type(screen.getByLabelText(/name/i), 'New Person');
    await user.type(screen.getByLabelText(/^role/i), 'Tenant');
    await user.type(screen.getByLabelText(/email/i), 'new@x.com');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        `/service-locations/${locationId}/contacts`,
        expect.objectContaining({ name: 'New Person', role: 'Tenant', email: 'new@x.com' })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('updates an existing contact via PUT', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServiceLocationContactDialog
        isOpen
        onClose={vi.fn()}
        locationId={locationId}
        contact={existingContact}
        queryKey={['x']}
        onRequestDelete={vi.fn()}
      />
    );

    const nameInput = screen.getByDisplayValue('Jane Manager');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane M.');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith(
        `/service-locations/${locationId}/contacts/${existingContact.id}`,
        expect.objectContaining({ name: 'Jane M.' })
      )
    );
  });

  it('delegates deletion to onRequestDelete', async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    renderWithProviders(
      <ServiceLocationContactDialog
        isOpen
        onClose={vi.fn()}
        locationId={locationId}
        contact={existingContact}
        queryKey={['x']}
        onRequestDelete={onRequestDelete}
      />
    );
    await user.click(screen.getByRole('button', { name: /delete contact/i }));
    expect(onRequestDelete).toHaveBeenCalled();
  });
});
