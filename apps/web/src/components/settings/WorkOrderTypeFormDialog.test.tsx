import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import WorkOrderTypeFormDialog from './WorkOrderTypeFormDialog';
import { apiClient } from '../../api/setup';
import type { WorkOrderType } from '../../api/setup';

vi.mock('@dispatch/api/src/client');

const existingItem: WorkOrderType = {
  id: 't1',
  tenantId: 'tn',
  name: 'Service Call',
  code: 'SERVICE_CALL',
  accentId: 'blue',
  isActive: true,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
};

describe('WorkOrderTypeFormDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the add title and empty fields in create mode', () => {
    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        colorsInUse={{}}
        queryKey={['work-order-types']}
      />
    );
    expect(screen.getByText(/add work order type/i)).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: /^name/i }) as HTMLInputElement).value).toBe('');
  });

  it('auto-derives the code from the name on every keystroke in create mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        colorsInUse={{}}
        queryKey={['work-order-types']}
      />
    );
    const nameInput = screen.getByRole('textbox', { name: /^name/i });
    await user.type(nameInput, 'Service Call');
    const codeInput = screen.getByRole('textbox', { name: /^code/i }) as HTMLInputElement;
    expect(codeInput.value).toBe('SERVICE_CALL');
  });

  it('stops auto-syncing code once the user edits it directly', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        colorsInUse={{}}
        queryKey={['work-order-types']}
      />
    );
    const nameInput = screen.getByRole('textbox', { name: /^name/i });
    const codeInput = screen.getByRole('textbox', { name: /^code/i }) as HTMLInputElement;

    await user.type(nameInput, 'Service');
    expect(codeInput.value).toBe('SERVICE');

    // User manually overrides the code — further name edits must not stomp it.
    await user.clear(codeInput);
    await user.type(codeInput, 'CUSTOM_CODE');
    await user.type(nameInput, ' Call');
    expect(codeInput.value).toBe('CUSTOM_CODE');
  });

  it('submits a create with name, code, accentId, and sortOrder', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...existingItem, id: 'new' },
    });
    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={5}
        colorsInUse={{}}
        queryKey={['work-order-types']}
      />
    );
    await user.type(screen.getByRole('textbox', { name: /^name/i }), 'Inspection');
    await user.click(screen.getByRole('button', { name: /create type/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/work-orders/config/types',
        expect.objectContaining({
          name: 'Inspection',
          code: 'INSPECTION',
          sortOrder: 5,
          accentId: expect.any(String),
        })
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('hydrates from the item in edit mode and submits an update', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: existingItem });

    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        item={existingItem}
        nextSortOrder={1}
        colorsInUse={{ blue: { typeId: 't1', typeName: 'Service Call' } }}
        queryKey={['work-order-types']}
      />
    );

    expect(screen.getByText(/edit service call/i)).toBeInTheDocument();
    const nameInput = screen.getByRole('textbox', { name: /^name/i }) as HTMLInputElement;
    expect(nameInput.value).toBe('Service Call');

    await user.clear(nameInput);
    await user.type(nameInput, 'Service Visit');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/work-orders/config/types/t1',
        expect.objectContaining({ name: 'Service Visit' }),
      );
    });
  });

  it('does not auto-sync the code when name changes in edit mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        item={existingItem}
        nextSortOrder={1}
        colorsInUse={{ blue: { typeId: 't1', typeName: 'Service Call' } }}
        queryKey={['work-order-types']}
      />
    );
    const nameInput = screen.getByRole('textbox', { name: /^name/i });
    const codeInput = screen.getByRole('textbox', { name: /^code/i }) as HTMLInputElement;
    expect(codeInput.value).toBe('SERVICE_CALL');

    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    expect(codeInput.value).toBe('SERVICE_CALL');
  });

  it('closes when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <WorkOrderTypeFormDialog
        isOpen
        onClose={onClose}
        nextSortOrder={1}
        colorsInUse={{}}
        queryKey={['work-order-types']}
      />
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
