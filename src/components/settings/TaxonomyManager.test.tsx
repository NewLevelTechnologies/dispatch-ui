import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import TaxonomyManager from './TaxonomyManager';
import type { TaxonomyItem } from '../../api';

const mockItems: TaxonomyItem[] = [
  {
    id: 'id-1',
    tenantId: 'tenant-1',
    name: 'Service Call',
    code: 'SERVICE_CALL',
    description: 'Reactive service',
    color: '#3B82F6',
    icon: null,
    isActive: true,
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'id-2',
    tenantId: 'tenant-1',
    name: 'Installation',
    code: 'INSTALLATION',
    description: null,
    color: '#10B981',
    icon: null,
    isActive: true,
    sortOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'id-3',
    tenantId: 'tenant-1',
    name: 'Maintenance',
    code: 'MAINTENANCE',
    description: null,
    color: '#F59E0B',
    icon: null,
    isActive: true,
    sortOrder: 2,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

function makeMockApi(items: TaxonomyItem[] = mockItems) {
  return {
    getAll: vi.fn().mockResolvedValue(items),
    create: vi.fn().mockResolvedValue(items[0]),
    update: vi.fn().mockResolvedValue(items[0]),
    delete: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue(items),
  };
}

const defaultProps = {
  title: 'Work Order Types',
  description: 'Categories that classify work orders.',
  entityLabel: 'Type',
  entityLabelPlural: 'Types',
  queryKey: ['test-taxonomy'],
};

describe('TaxonomyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, description, and items in a sorted table', async () => {
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    expect(screen.getByRole('heading', { name: 'Work Order Types' })).toBeInTheDocument();
    expect(screen.getByText('Categories that classify work orders.')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Service Call')).toBeInTheDocument();
    });
    expect(screen.getByText('Installation')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('SERVICE_CALL')).toBeInTheDocument();
  });

  it('renders empty state when there are no items', async () => {
    const api = makeMockApi([]);
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => {
      expect(screen.getByText(/no.*types.*found/i)).toBeInTheDocument();
    });
  });

  it('surfaces API error message on load failure', async () => {
    const api = makeMockApi();
    const error = Object.assign(new Error('Request failed'), {
      response: { data: { message: 'Tenant not initialized' } },
    });
    api.getAll.mockRejectedValue(error);

    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => {
      expect(screen.getByText('Tenant not initialized')).toBeInTheDocument();
    });
  });

  it('opens the create dialog when Add is clicked and submits with auto sortOrder', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add type/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Warranty');

    // Code auto-populates from name
    expect(within(dialog).getByLabelText(/code/i)).toHaveValue('WARRANTY');

    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith({
        name: 'Warranty',
        code: 'WARRANTY',
        description: null,
        color: '#6366F1',
        sortOrder: 3, // max(0,1,2) + 1
      });
    });
  });

  it('opens the edit dialog from the row dropdown and submits update', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Installation')).toBeInTheDocument());

    // Find the row for "Installation" and click its dropdown trigger
    const installationRow = screen.getByText('Installation').closest('tr')!;
    const dropdownTrigger = within(installationRow).getByRole('button', { name: /more options/i });
    await user.click(dropdownTrigger);

    const editItem = await screen.findByRole('menuitem', { name: /^edit$/i });
    await user.click(editItem);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/name/i)).toHaveValue('Installation');

    // Code field is disabled in edit mode
    expect(within(dialog).getByLabelText(/code/i)).toBeDisabled();

    const nameInput = within(dialog).getByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Install');
    await user.click(within(dialog).getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith('id-2', expect.objectContaining({
        name: 'Install',
        color: '#10B981',
      }));
    });
    // sortOrder is NOT in the update payload (no longer editable)
    expect(api.update.mock.calls[0][1]).not.toHaveProperty('sortOrder');
  });

  it('deletes an item after confirm', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Maintenance')).toBeInTheDocument());

    const row = screen.getByText('Maintenance').closest('tr')!;
    const trigger = within(row).getByRole('button', { name: /more options/i });
    await user.click(trigger);

    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('id-3'));

    confirmSpy.mockRestore();
  });

  it('does not delete if confirm returns false', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Maintenance')).toBeInTheDocument());

    const row = screen.getByText('Maintenance').closest('tr')!;
    const trigger = within(row).getByRole('button', { name: /more options/i });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    expect(api.delete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('moves an item up via the up arrow', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Installation')).toBeInTheDocument());

    // Click "Move up" on the second row (Installation), should swap with first (Service Call)
    const installationRow = screen.getByText('Installation').closest('tr')!;
    const moveUpButton = within(installationRow).getByRole('button', { name: /move up/i });
    await user.click(moveUpButton);

    await waitFor(() => {
      expect(api.reorder).toHaveBeenCalledWith(['id-2', 'id-1', 'id-3']);
    });
  });

  it('moves an item down via the down arrow', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    const firstRow = screen.getByText('Service Call').closest('tr')!;
    const moveDownButton = within(firstRow).getByRole('button', { name: /move down/i });
    await user.click(moveDownButton);

    await waitFor(() => {
      expect(api.reorder).toHaveBeenCalledWith(['id-2', 'id-1', 'id-3']);
    });
  });

  it('disables move-up on the first row and move-down on the last', async () => {
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    const firstRow = screen.getByText('Service Call').closest('tr')!;
    expect(within(firstRow).getByRole('button', { name: /move up/i })).toBeDisabled();

    const lastRow = screen.getByText('Maintenance').closest('tr')!;
    expect(within(lastRow).getByRole('button', { name: /move down/i })).toBeDisabled();
  });

  it('exercises every dialog field on create (color picker + text + description)', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add type/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Warranty');
    await user.type(within(dialog).getByLabelText(/description/i), 'Warranty work');

    // Color: fire on the picker AND the text mirror (separate inline onChange handlers).
    // Color inputs in jsdom normalize value to lowercase so query by attribute selector.
    const colorPicker = dialog.querySelector('input[type="color"]') as HTMLInputElement;
    const colorText = dialog.querySelector('input[name="color"][type="text"]') as HTMLInputElement
      || within(dialog).getAllByDisplayValue(/^#/i).find((i) => (i as HTMLInputElement).type === 'text');
    fireEvent.change(colorPicker, { target: { value: '#888888' } });
    if (colorText) {
      await user.clear(colorText);
      await user.type(colorText, '#FF0000');
    }

    // Manually edit the code (after auto-gen) to exercise that handler
    const codeInput = within(dialog).getByLabelText(/code/i);
    await user.clear(codeInput);
    await user.type(codeInput, 'WARRANTY_WORK');

    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Warranty',
        code: 'WARRANTY_WORK',
        description: 'Warranty work',
        color: '#FF0000',
      }));
    });
  });

  it('alerts with API message when create fails', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Code already in use' } },
    });
    api.create.mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add type/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Service Call');
    await user.click(within(dialog).getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Code already in use');
    });
    alertSpy.mockRestore();
  });

  it('alerts with API message when update fails', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'Not allowed' } },
    });
    api.update.mockRejectedValue(error);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Installation')).toBeInTheDocument());

    const row = screen.getByText('Installation').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^update$/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Not allowed');
    });
    alertSpy.mockRestore();
  });

  it('alerts with API message when delete fails', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    const error = Object.assign(new Error('fail'), {
      response: { data: { message: 'In use somewhere' } },
    });
    api.delete.mockRejectedValue(error);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Maintenance')).toBeInTheDocument());

    const row = screen.getByText('Maintenance').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^delete$/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('In use somewhere');
    });
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('cancel button closes the dialog without submitting', async () => {
    const user = userEvent.setup();
    const api = makeMockApi();
    renderWithProviders(<TaxonomyManager {...defaultProps} api={api} />);

    await waitFor(() => expect(screen.getByText('Service Call')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add type/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(api.create).not.toHaveBeenCalled();
  });
});
