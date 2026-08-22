import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import DivisionFormDialog from './DivisionFormDialog';
import { apiClient } from '../../api/setup';
import type { Division } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

const existingItem: Division = {
  id: 'd1',
  tenantId: 'tn',
  name: 'HVAC',
  code: 'HVAC',
  isActive: true,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
};

describe('DivisionFormDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the add title and empty fields in create mode', () => {
    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        queryKey={['divisions']}
      />
    );
    expect(screen.getByText(/add division/i)).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: /^name/i }) as HTMLInputElement).value).toBe('');
  });

  it('auto-derives the code from the name in create mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        queryKey={['divisions']}
      />
    );
    await user.type(screen.getByRole('textbox', { name: /^name/i }), 'Electrical');
    const codeInput = screen.getByRole('textbox', { name: /^code/i }) as HTMLInputElement;
    expect(codeInput.value).toBe('ELECTRICAL');
  });

  it('stops auto-syncing code once the user edits it directly', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        queryKey={['divisions']}
      />
    );
    const nameInput = screen.getByRole('textbox', { name: /^name/i });
    const codeInput = screen.getByRole('textbox', { name: /^code/i }) as HTMLInputElement;

    await user.type(nameInput, 'HVAC');
    expect(codeInput.value).toBe('HVAC');

    await user.clear(codeInput);
    await user.type(codeInput, 'CUSTOM');
    await user.type(nameInput, ' Service');
    expect(codeInput.value).toBe('CUSTOM');
  });

  it('submits a create with name, code, and sortOrder', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...existingItem, id: 'new' },
    });
    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={3}
        queryKey={['divisions']}
      />
    );
    await user.type(screen.getByRole('textbox', { name: /^name/i }), 'Plumbing');
    await user.click(screen.getByRole('button', { name: /create division/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/divisions',
        expect.objectContaining({
          name: 'Plumbing',
          code: 'PLUMBING',
          sortOrder: 3,
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('hydrates from the item in edit mode and submits an update', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: existingItem });

    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        item={existingItem}
        nextSortOrder={1}
        queryKey={['divisions']}
      />
    );

    expect(screen.getByText(/edit hvac/i)).toBeInTheDocument();
    const nameInput = screen.getByRole('textbox', { name: /^name/i }) as HTMLInputElement;
    expect(nameInput.value).toBe('HVAC');

    await user.clear(nameInput);
    await user.type(nameInput, 'HVAC + Refrigeration');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/config/divisions/d1',
        expect.objectContaining({ name: 'HVAC + Refrigeration' }),
      );
    });
  });

  it('does not auto-sync the code when name changes in edit mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        item={existingItem}
        nextSortOrder={1}
        queryKey={['divisions']}
      />
    );
    const nameInput = screen.getByRole('textbox', { name: /^name/i });
    const codeInput = screen.getByRole('textbox', { name: /^code/i }) as HTMLInputElement;
    expect(codeInput.value).toBe('HVAC');

    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    expect(codeInput.value).toBe('HVAC');
  });

  it('closes when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DivisionFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        queryKey={['divisions']}
      />
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
