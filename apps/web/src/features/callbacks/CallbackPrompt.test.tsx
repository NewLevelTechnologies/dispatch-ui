import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { CallbackPrompt } from './CallbackPrompt';
import { UNSET, type CallbackValue } from './callbackModel';

const mockCandidates = vi.fn();
const mockSearch = vi.fn();
const mockCharge = vi.fn();

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    workOrderApi: {
      ...actual.workOrderApi,
      getCallbackCandidates: (...a: unknown[]) => mockCandidates(...a),
      getAll: (...a: unknown[]) => mockSearch(...a),
      getCallbackCharge: (...a: unknown[]) => mockCharge(...a),
    },
  };
});

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: 'wo-1234',
    workOrderNumber: 'WO-1234',
    completedDate: '2026-09-18',
    summary: 'No cooling — upstairs unit',
    matchedOn: { location: true, equipment: true },
    sameLocation: true,
    equipment: [{ id: 'eq-1', name: 'Upstairs condenser' }],
    isAgreementVisit: false,
    technicians: [{ userId: 't1', name: 'Daniel Park' }],
    ...over,
  };
}

// The prompt is controlled; this mirrors how the intake page holds its value.
function Harness({ isCallbackType = false, onValue }: { isCallbackType?: boolean; onValue?: (v: CallbackValue) => void }) {
  const [value, setValue] = useState<CallbackValue>(UNSET);
  return (
    <CallbackPrompt
      serviceLocationId="sl-1"
      customerId="c-1"
      equipmentIds={['eq-1']}
      isCallbackType={isCallbackType}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCandidates.mockResolvedValue([]);
  mockSearch.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 8 });
});

describe('CallbackPrompt', () => {
  it('offers one quiet line when nothing is suggested, which opens the search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const quiet = await screen.findByTestId('callback-quiet-entry');
    expect(mockCandidates).toHaveBeenCalledWith({
      serviceLocationId: 'sl-1',
      equipmentIds: ['eq-1'],
      excludeWorkOrderId: undefined,
    });
    // A late callback typed Warranty can still be linked at intake.
    await user.click(within(quiet).getByRole('button', { name: 'callbacks.linkIt' }));
    expect(screen.getByRole('textbox', { name: 'callbacks.searchTitle' })).toBeInTheDocument();
  });

  it('offers recent jobs, and linking one names who it charges before save', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    mockCandidates.mockResolvedValue([
      candidate(),
      candidate({
        id: 'wo-1219',
        workOrderNumber: 'WO-1219',
        matchedOn: { location: true, equipment: false },
        equipment: [],
        isAgreementVisit: true,
        technicians: [{ userId: 't2', name: 'Luis Ortega' }, { userId: 't3', name: null }],
      }),
    ]);
    renderWithProviders(<Harness onValue={onValue} />);

    // Collapsed bar first; never blocks.
    await user.click(await screen.findByRole('button', { name: 'callbacks.review' }));
    const rows = screen.getAllByTestId('callback-candidate');
    expect(within(rows[0]).getByText('callbacks.sameEquipment')).toBeInTheDocument();
    expect(within(rows[1]).getByText('callbacks.sameLocation')).toBeInTheDocument();
    expect(within(rows[1]).getByText('callbacks.agreementVisit')).toBeInTheDocument();

    await user.click(within(rows[0]).getByRole('button', { name: 'callbacks.link' }));
    const linked = screen.getByTestId('callback-linked');
    expect(linked).toHaveTextContent('WO-1234');
    expect(linked).toHaveTextContent('Daniel Park');
    expect(onValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'linked', job: expect.objectContaining({ id: 'wo-1234' }) }),
    );
  });

  it('opens straight to a customer-scoped search with no date limit for the callback type', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    mockSearch.mockResolvedValue({
      content: [
        {
          id: 'wo-1150',
          workOrderNumber: 'WO-1150',
          summary: 'Condenser fan motor',
          completedDate: '2026-07-30',
          createdAt: '2026-07-28T10:00:00Z',
          serviceLocation: { id: 'sl-2', locationName: 'Reyes Rental' },
        },
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 8,
    });
    mockCharge.mockResolvedValue({ chargedTechnicians: [{ userId: 't4', name: 'Grace Kim' }] });
    renderWithProviders(<Harness isCallbackType onValue={onValue} />);

    expect(await screen.findByText('callbacks.nothingRecent', { exact: false })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'callbacks.searchTitle' }), 'fan');
    const result = await screen.findByTestId('callback-search-result');
    expect(mockSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'c-1', q: 'fan', progressCategory: 'COMPLETED', lifecycleState: 'ACTIVE' }),
    );
    expect(result).toHaveTextContent('Reyes Rental');

    // A job that wasn't suggested: ask who it would charge before linking.
    await user.click(within(result).getByRole('button', { name: 'callbacks.link' }));
    expect(mockCharge).toHaveBeenCalledWith('wo-1150');
    expect(await screen.findByTestId('callback-linked')).toHaveTextContent('Grace Kim');
  });

  it('records "new work" as not a callback, and Change reopens it', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    mockCandidates.mockResolvedValue([candidate()]);
    renderWithProviders(<Harness onValue={onValue} />);

    await user.click(await screen.findByRole('button', { name: 'callbacks.review' }));
    await user.click(screen.getByRole('button', { name: 'callbacks.newWork' }));
    expect(onValue).toHaveBeenLastCalledWith({ state: 'dismissed' });
    expect(screen.getByText('callbacks.notACallback')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'callbacks.change' }));
    expect(screen.getAllByTestId('callback-candidate')).toHaveLength(1);
  });
});
