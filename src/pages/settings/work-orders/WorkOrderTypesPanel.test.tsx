import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/utils';
import WorkOrderTypesPanel from './WorkOrderTypesPanel';
import apiClient from '../../../api/client';

vi.mock('../../../api/client');

describe('WorkOrderTypesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  });

  it('renders the Work Order Types title', async () => {
    renderWithProviders(<WorkOrderTypesPanel />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /work order types/i })).toBeInTheDocument();
    });
  });

  it('hits the work-order-types endpoint via the underlying api', async () => {
    renderWithProviders(<WorkOrderTypesPanel />);
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/work-orders/config/types');
    });
  });
});
