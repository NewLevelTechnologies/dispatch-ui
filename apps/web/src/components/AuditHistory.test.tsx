import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import AuditHistory from './AuditHistory';
import { auditApi, type AuditLog } from '../api/setup';

vi.mock('@dispatch/api/src/auditApi', async () => {
  const actual = await vi.importActual<typeof import('../api/setup')>('@dispatch/api/src/auditApi');
  return {
    ...actual,
    auditApi: {
      getEntityHistory: vi.fn(),
      getUserHistory: vi.fn(),
      getRecentHistory: vi.fn(),
      getAccountActivity: vi.fn(),
      enrichLatestSignIn: vi.fn(),
    },
  };
});

const baseLog: AuditLog = {
  id: 'a-1',
  tenantId: 't-1',
  userId: 'u-1',
  userEmail: 'csr@example.com',
  userName: 'Casey CSR',
  entityType: 'Customer',
  entityId: 'c-1',
  action: 'CREATE',
  timestamp: '2026-05-17T10:00:00Z',
};

describe('AuditHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading state while fetching', () => {
    vi.mocked(auditApi.getEntityHistory).mockImplementation(
      () => new Promise(() => {}),
    );
    renderWithProviders(<AuditHistory entityType="Customer" entityId="c-1" />);
    expect(screen.getByText('audit.loading')).toBeInTheDocument();
  });

  it('shows the error state when the query fails', async () => {
    vi.mocked(auditApi.getEntityHistory).mockRejectedValue(new Error('boom'));
    renderWithProviders(<AuditHistory entityType="Customer" entityId="c-1" />);
    await waitFor(() => {
      expect(screen.getByText(/audit\.errorLoading/)).toBeInTheDocument();
    });
  });

  it('shows the empty state when there are no logs', async () => {
    vi.mocked(auditApi.getEntityHistory).mockResolvedValue([]);
    renderWithProviders(<AuditHistory entityType="Customer" entityId="c-1" />);
    await waitFor(() => {
      expect(screen.getByText('audit.noHistory')).toBeInTheDocument();
    });
  });

  it('renders CREATE, UPDATE, and DELETE rows with their field changes', async () => {
    vi.mocked(auditApi.getEntityHistory).mockResolvedValue([
      {
        ...baseLog,
        id: 'a-create',
        action: 'CREATE',
        newValues: { name: 'Bob', id: 'skip-me', notes: null },
      },
      {
        ...baseLog,
        id: 'a-update',
        action: 'UPDATE',
        oldValues: { name: 'Bob', notes: 'old' },
        newValues: { name: 'Bob', notes: 'new' },
      },
      {
        ...baseLog,
        id: 'a-update-noop',
        action: 'UPDATE',
        oldValues: { name: 'Same' },
        newValues: { name: 'Same' },
      },
      {
        ...baseLog,
        id: 'a-delete',
        action: 'DELETE',
        oldValues: { name: 'Bob', archived: true, meta: { plan: 'pro' } },
      },
    ]);

    renderWithProviders(<AuditHistory entityType="Customer" entityId="c-1" />);

    await waitFor(() => {
      expect(screen.getByText('audit.title')).toBeInTheDocument();
    });
    expect(screen.getAllByText('CREATE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UPDATE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DELETE').length).toBeGreaterThan(0);
    expect(screen.getByText('audit.noFieldChanges')).toBeInTheDocument();
    expect(screen.getByText('audit.totalEvents')).toBeInTheDocument();
  });
});
