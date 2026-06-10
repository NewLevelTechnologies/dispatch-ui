import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, fireEvent, waitFor, userEvent } from '../test/utils';
import { renderWithProviders } from '../test/utils';
import VisitTemplateFormDialog from './VisitTemplateFormDialog';
import { agreementApi } from '../api';

vi.mock('../api', () => ({
  agreementApi: { createVisitTemplate: vi.fn(), updateVisitTemplate: vi.fn() },
}));

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
    // First scope row (placeholder "Replace filters").
    await userEvent.type(within(dialog).getByPlaceholderText('Replace filters'), 'Replace filters');

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
});
