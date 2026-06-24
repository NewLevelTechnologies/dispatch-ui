import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, fireEvent, waitFor, userEvent } from '../test/utils';
import { renderWithProviders } from '../test/utils';
import VisitTemplateFormDialog from './VisitTemplateFormDialog';
import { agreementApi, type VisitTemplateResponse } from '../api';

vi.mock('../api', () => ({
  agreementApi: { createVisitTemplate: vi.fn(), updateVisitTemplate: vi.fn() },
}));

const templateWithScope: VisitTemplateResponse = {
  id: 't-1',
  agreementId: 'a-1',
  label: 'Quarterly PM',
  cadenceUnit: 'QUARTER',
  cadenceInterval: 1,
  anchorDate: '2026-01-01',
  seasonOrdinal: null,
  windowDays: 30,
  estDurationMinutes: 90,
  scopeItems: [{ description: 'Replace filters', equipmentTypeId: null, season: null }],
  scopeVersion: 3,
  createdAt: '',
  updatedAt: '',
};

describe('VisitTemplateFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agreementApi.createVisitTemplate).mockResolvedValue({} as never);
  });

  it('creates a visit template from the required fields + scope items', async () => {
    const onClose = vi.fn();
    renderWithProviders(<VisitTemplateFormDialog isOpen onClose={onClose} agreementId="a-1" />);

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^label$/i }), 'Summer PM');
    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-07-01' } });
    // First scope row — the single full-width task input.
    await userEvent.type(within(dialog).getByLabelText('Scope item description'), 'Replace filters');

    await userEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

    await waitFor(() =>
      expect(agreementApi.createVisitTemplate).toHaveBeenCalledWith(
        'a-1',
        expect.objectContaining({
          label: 'Summer PM',
          cadenceUnit: 'QUARTER',
          anchorDate: '2026-07-01',
          scopeItems: [{ description: 'Replace filters', equipmentTypeId: null, season: null }],
        }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('sends edited scope items on update', async () => {
    vi.mocked(agreementApi.updateVisitTemplate).mockResolvedValue({} as never);
    renderWithProviders(
      <VisitTemplateFormDialog isOpen onClose={vi.fn()} agreementId="a-1" template={templateWithScope} />,
    );

    const dialog = await screen.findByRole('dialog');
    // Existing scope pre-fills; append text to the first row's description.
    await userEvent.type(within(dialog).getByLabelText('Scope item description'), ' + coil clean');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(agreementApi.updateVisitTemplate).toHaveBeenCalled());
    const body = vi.mocked(agreementApi.updateVisitTemplate).mock.calls[0][2];
    expect(body.scopeItems).toEqual([
      { description: 'Replace filters + coil clean', equipmentTypeId: null, season: null },
    ]);
  });

  it('omits scopeItems on update when scope is untouched (no clobber)', async () => {
    vi.mocked(agreementApi.updateVisitTemplate).mockResolvedValue({} as never);
    renderWithProviders(
      <VisitTemplateFormDialog isOpen onClose={vi.fn()} agreementId="a-1" template={templateWithScope} />,
    );

    const dialog = await screen.findByRole('dialog');
    // Edit only the label — never touch scope.
    const labelInput = within(dialog).getByRole('textbox', { name: /^label$/i });
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, 'Annual PM');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(agreementApi.updateVisitTemplate).toHaveBeenCalled());
    const body = vi.mocked(agreementApi.updateVisitTemplate).mock.calls[0][2];
    expect(body.label).toBe('Annual PM');
    // Untouched scope → field omitted so the PATCH leaves it intact.
    expect(body.scopeItems).toBeUndefined();
  });
});
