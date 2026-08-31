import { useQuery } from '@tanstack/react-query';
import { workflowConfigApi } from '../api/setup';

// Gates discoverability of the Approvals surface (sidebar nav entry +
// topbar bell). Surface is shown when the tenant is currently STRICT
// OR has any historical approval requests — i.e., the data is relevant
// today or might be referenced. A brand-new OPEN tenant with no
// history gets a quieter topbar.
//
// The `/approvals` page itself stays reachable regardless (bookmarks /
// deep-links keep working) — only its surfacing is gated.
//
// Shares the `workflow-config` query key with WorkOrderDetailPage so a
// single fetch backs both consumers.
export function useApprovalsVisible(): boolean {
  const { data: config } = useQuery({
    queryKey: ['workflow-config'],
    queryFn: () => workflowConfigApi.get(),
    staleTime: 60_000,
  });
  if (!config) return false;
  return config.enforcementMode === 'STRICT' || !!config.hasAnyApprovalRequests;
}

export default useApprovalsVisible;
