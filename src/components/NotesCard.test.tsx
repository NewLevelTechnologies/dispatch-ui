import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import NotesCard from './NotesCard';

// Equipment notes are nested under the equipment id; customer/location notes act
// on a bare /notes/{id}. Mock both underlying API modules (the component reaches
// them through the '../api' barrel) so we can assert the entity-specific call
// shapes — especially the equipment id threaded into update/delete.
const eqList = vi.fn();
const eqCreate = vi.fn();
const eqUpdate = vi.fn();
const eqDelete = vi.fn();

const custList = vi.fn();
const custCreate = vi.fn();
const noteUpdate = vi.fn();
const noteDelete = vi.fn();

// Work-order notes go through the separate notesApi client (WorkOrderNote shape,
// work-order-scoped update/delete). The card adapts it to NoteDto via woNoteToDto.
const woList = vi.fn();
const woCreate = vi.fn();
const woUpdate = vi.fn();
const woDelete = vi.fn();

const mockShowError = vi.fn();

vi.mock('../api/equipmentApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/equipmentApi')>();
  return {
    ...actual,
    equipmentNotesApi: {
      list: (...a: unknown[]) => eqList(...a),
      create: (...a: unknown[]) => eqCreate(...a),
      update: (...a: unknown[]) => eqUpdate(...a),
      delete: (...a: unknown[]) => eqDelete(...a),
    },
  };
});

vi.mock('../api/noteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/noteApi')>();
  return {
    ...actual,
    noteApi: {
      listForCustomer: (...a: unknown[]) => custList(...a),
      createForCustomer: (...a: unknown[]) => custCreate(...a),
      listForServiceLocation: vi.fn().mockResolvedValue([]),
      createForServiceLocation: vi.fn(),
      update: (...a: unknown[]) => noteUpdate(...a),
      delete: (...a: unknown[]) => noteDelete(...a),
    },
  };
});

vi.mock('../api/notesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/notesApi')>();
  return {
    ...actual,
    notesApi: {
      list: (...a: unknown[]) => woList(...a),
      create: (...a: unknown[]) => woCreate(...a),
      update: (...a: unknown[]) => woUpdate(...a),
      delete: (...a: unknown[]) => woDelete(...a),
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

// WorkOrderNote shape (distinct from NoteDto — createdByUserName vs authorName,
// no pinned on the legacy shape but the upgraded endpoint carries it).
const woNote = (o: Record<string, unknown> = {}) => ({
  id: 'won-1',
  workOrderId: 'wo-1',
  body: 'WO note body',
  pinned: false,
  createdByUserId: 'u-1',
  createdByUserName: 'Dan',
  createdAt: '2026-05-01T12:00:00Z',
  updatedAt: '2026-05-01T12:00:00Z',
  ...o,
});

// 1 pinned + 5 unpinned: the card peeks pinned + 3 newest unpinned; U4/U5 live
// only in the drawer. Used by the cap / drawer tests.
const manyNotes = () => [
  note({ id: 'p1', body: 'Pinned A', pinned: true }),
  note({ id: 'u1', body: 'U1' }),
  note({ id: 'u2', body: 'U2' }),
  note({ id: 'u3', body: 'U3' }),
  note({ id: 'u4', body: 'U4' }),
  note({ id: 'u5', body: 'U5' }),
];

describe('NotesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqList.mockResolvedValue([]);
    custList.mockResolvedValue([]);
  });

  it('shows the empty state', async () => {
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
  });

  it('renders notes with a pinned label and body', async () => {
    custList.mockResolvedValue([
      note({ pinned: true, body: 'Chronic drift' }),
      note({ id: 'n-2', body: 'Filter due', authorName: 'Bob' }),
    ]);
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);
    expect(await screen.findByText('Chronic drift')).toBeInTheDocument();
    expect(screen.getByText('Filter due')).toBeInTheDocument();
    expect(screen.getByText(/pinned ·/i)).toBeInTheDocument();
  });

  it('adds a note via the card composer (flat customer endpoint)', async () => {
    custCreate.mockResolvedValue(note());
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);
    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'New note');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(custCreate).toHaveBeenCalledWith('cust-1', { body: 'New note', pinned: false });
    });
  });

  it('pins a note, threading the equipment id (nested endpoint)', async () => {
    eqList.mockResolvedValue([note()]);
    eqUpdate.mockResolvedValue(note({ pinned: true }));
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="equipment" entityId="eq-1" />);
    await screen.findByText('Body one');
    await user.click(screen.getByRole('button', { name: /^pin$/i }));
    await waitFor(() => {
      expect(eqUpdate).toHaveBeenCalledWith('eq-1', 'n-1', { pinned: true });
    });
  });

  it('edits a note, threading the equipment id (nested endpoint)', async () => {
    eqList.mockResolvedValue([note()]);
    eqUpdate.mockResolvedValue(note());
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="equipment" entityId="eq-1" />);
    await screen.findByText('Body one');
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const dialog = await screen.findByRole('dialog');
    const textbox = within(dialog).getByRole('textbox');
    await user.clear(textbox);
    await user.type(textbox, 'Updated body');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(eqUpdate).toHaveBeenCalledWith('eq-1', 'n-1', { body: 'Updated body', pinned: false });
    });
  });

  it('deletes a note after confirmation (flat customer endpoint)', async () => {
    custList.mockResolvedValue([note()]);
    noteDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);
    await screen.findByText('Body one');

    // The row's delete icon is the only "Delete" control until the confirm opens.
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    // Confirm adds a second "Delete" button (the alert action) — click the last.
    const deleteButtons = await screen.findAllByRole('button', { name: /^delete$/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => {
      expect(noteDelete).toHaveBeenCalledWith('n-1');
    });
  });

  // Work-order binding — adapts WorkOrderNote → NoteDto and routes writes to the
  // work-order-scoped notesApi (distinct from the flat /notes/{id} path).
  it('lists work-order notes, adapting the WorkOrderNote shape', async () => {
    woList.mockResolvedValue([woNote({ body: 'Two kids in home', pinned: true })]);
    renderWithProviders(<NotesCard entityType="work_order" entityId="wo-1" />);
    expect(await screen.findByText('Two kids in home')).toBeInTheDocument();
    expect(screen.getByText(/pinned ·/i)).toBeInTheDocument();
  });

  it('adds a work-order note via the composer', async () => {
    woList.mockResolvedValue([]);
    woCreate.mockResolvedValue(woNote());
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="work_order" entityId="wo-1" />);
    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'New WO note');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(woCreate).toHaveBeenCalledWith('wo-1', { body: 'New WO note', pinned: false });
    });
  });

  it('edits a work-order note (work-order-scoped update)', async () => {
    woList.mockResolvedValue([woNote()]);
    woUpdate.mockResolvedValue(woNote());
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="work_order" entityId="wo-1" />);
    await screen.findByText('WO note body');
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const dialog = await screen.findByRole('dialog');
    const textbox = within(dialog).getByRole('textbox');
    await user.clear(textbox);
    await user.type(textbox, 'Edited WO note');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(woUpdate).toHaveBeenCalledWith('wo-1', 'won-1', { body: 'Edited WO note', pinned: false });
    });
  });

  it('deletes a work-order note (work-order-scoped delete)', async () => {
    woList.mockResolvedValue([woNote()]);
    woDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="work_order" entityId="wo-1" />);
    await screen.findByText('WO note body');
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const deleteButtons = await screen.findAllByRole('button', { name: /^delete$/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => {
      expect(woDelete).toHaveBeenCalledWith('wo-1', 'won-1');
    });
  });

  it('surfaces a toast when saving fails', async () => {
    custCreate.mockRejectedValue(Object.assign(new Error('x'), { response: { data: { message: 'Nope' } } }));
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);
    await user.click(await screen.findByRole('button', { name: /^\+ add$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'X');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });

  it('caps the card at pinned + 3 unpinned and reveals the rest in the "Show all" drawer', async () => {
    custList.mockResolvedValue(manyNotes());
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);

    await screen.findByText('Pinned A');
    expect(screen.getByText('U3')).toBeInTheDocument();
    expect(screen.queryByText('U4')).not.toBeInTheDocument();
    expect(screen.queryByText('U5')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show all 6/i }));

    // The hidden notes live only in the drawer, so these queries are unambiguous.
    expect(await screen.findByText('U5')).toBeInTheDocument();
    expect(screen.getByText('U4')).toBeInTheDocument();
  });

  it('hides "Show all" when there are 3 or fewer unpinned notes', async () => {
    custList.mockResolvedValue([
      note({ id: 'p1', body: 'Pinned A', pinned: true }),
      note({ id: 'u1', body: 'U1' }),
      note({ id: 'u2', body: 'U2' }),
      note({ id: 'u3', body: 'U3' }),
    ]);
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);
    await screen.findByText('U3');
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('adds a note from the drawer composer', async () => {
    custList.mockResolvedValue(manyNotes());
    custCreate.mockResolvedValue(note({ id: 'new', body: 'From the drawer' }));
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);

    await screen.findByText('Pinned A');
    await user.click(screen.getByRole('button', { name: /show all 6/i }));

    await user.type(await screen.findByPlaceholderText(/add a note/i), 'From the drawer');
    await user.click(screen.getByRole('button', { name: /^add note$/i }));
    await waitFor(() => {
      expect(custCreate).toHaveBeenCalledWith('cust-1', { body: 'From the drawer', pinned: false });
    });
  });

  it('filters the drawer list by search', async () => {
    custList.mockResolvedValue(manyNotes());
    const user = userEvent.setup();
    renderWithProviders(<NotesCard entityType="customer" entityId="cust-1" />);

    await screen.findByText('Pinned A');
    await user.click(screen.getByRole('button', { name: /show all 6/i }));

    const drawer = await screen.findByRole('dialog');
    await user.type(within(drawer).getByPlaceholderText(/search notes/i), 'U5');
    // Within the drawer, only the matching note remains.
    await waitFor(() => {
      expect(within(drawer).queryByText('U1')).not.toBeInTheDocument();
    });
    expect(within(drawer).getByText('U5')).toBeInTheDocument();
  });
});
