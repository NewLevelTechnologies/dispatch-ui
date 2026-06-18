import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EquipmentNotesCard from './EquipmentNotesCard';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockShowError = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentNotesApi: {
      list: (...a: unknown[]) => mockList(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  };
});

vi.mock('../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/toast')>();
  return { ...actual, showError: (...a: unknown[]) => mockShowError(...a), showSuccess: vi.fn() };
});

vi.mock('../api/client');

const note = (o: Record<string, unknown> = {}) => ({
  id: 'n-1',
  body: 'Body one',
  authorUserId: 'u-1',
  authorName: 'Jane',
  pinned: false,
  createdAt: '2026-05-01T12:00:00Z',
  updatedAt: '2026-05-01T12:00:00Z',
  ...o,
});

describe('EquipmentNotesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
  });

  it('shows the empty state', async () => {
    renderWithProviders(<EquipmentNotesCard equipmentId="eq-1" />);
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
  });

  it('renders notes with a pinned label and body', async () => {
    mockList.mockResolvedValue([note({ pinned: true, body: 'Chronic drift' }), note({ id: 'n-2', body: 'Filter due', authorName: 'Bob' })]);
    renderWithProviders(<EquipmentNotesCard equipmentId="eq-1" />);
    expect(await screen.findByText('Chronic drift')).toBeInTheDocument();
    expect(screen.getByText('Filter due')).toBeInTheDocument();
    expect(screen.getByText(/pinned ·/i)).toBeInTheDocument();
  });

  it('adds a note via the composer', async () => {
    mockCreate.mockResolvedValue(note());
    const user = userEvent.setup();
    renderWithProviders(<EquipmentNotesCard equipmentId="eq-1" />);
    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'New note');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('eq-1', { body: 'New note', pinned: false });
    });
  });

  it('pins and deletes a note from the row menu', async () => {
    mockList.mockResolvedValue([note()]);
    mockUpdate.mockResolvedValue(note());
    mockDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<EquipmentNotesCard equipmentId="eq-1" />);
    await screen.findByText('Body one');

    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^pin$/i }));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', 'n-1', { pinned: true });
    });

    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('eq-1', 'n-1');
    });
  });

  it('edits a note from the row menu', async () => {
    mockList.mockResolvedValue([note()]);
    mockUpdate.mockResolvedValue(note());
    const user = userEvent.setup();
    renderWithProviders(<EquipmentNotesCard equipmentId="eq-1" />);
    await screen.findByText('Body one');

    await user.click(screen.getByRole('button', { name: /more options/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit/i }));
    const dialog = await screen.findByRole('dialog');
    const textbox = within(dialog).getByRole('textbox');
    await user.clear(textbox);
    await user.type(textbox, 'Updated body');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('eq-1', 'n-1', { body: 'Updated body', pinned: false });
    });
  });

  it('surfaces a toast when saving fails', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { message: 'Nope' } } }));
    const user = userEvent.setup();
    renderWithProviders(<EquipmentNotesCard equipmentId="eq-1" />);
    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'X');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
