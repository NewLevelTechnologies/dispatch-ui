// ─────────────────────────────────────────────────────────────────
// AssignedUsersCell.tsx — dense-table cell for a work order's assigned users.
//
// Renders straight off `WorkOrderSummary.technicians` (embedded on every
// search row, most-relevant-first: on-site → soonest upcoming → most recent
// past) — no scheduling-service merge needed. "Assigned", not "tech": a
// dispatch can put anyone on site (field tech, sales call, estimator).
// Round initials avatar (round = person) + the lead name, "+N" for the rest
// (a count, not stacked avatars — too dense for table rows). Avatar bg uses
// the same name-hash (roleColor) as user avatars elsewhere, so a person
// reads the same color everywhere. Name can be null while the user cache
// catches up — fall back to "Assigned user" rather than blanking.
// ─────────────────────────────────────────────────────────────────
import { useTranslation } from 'react-i18next';
import type { WorkOrderTechnician } from '../../api';
import { roleColor } from '../../utils/roleColor';

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function AssignedUsersCell({ users }: { users?: WorkOrderTechnician[] }) {
  const { t } = useTranslation();
  const lead = users?.[0];
  if (!lead) return <span className="text-[11px] text-fg-dim">—</span>;

  const named = Boolean(lead.name);
  const name = lead.name ?? t('workOrders.table.assignedUser');
  const extra = (users?.length ?? 1) - 1;
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white"
        style={{ background: named ? roleColor(name) : 'var(--fg-dim)' }}
      >
        {named ? userInitials(name) : '—'}
      </span>
      <span className="text-[12px] text-fg">
        {name}
        {extra > 0 ? ` +${extra}` : ''}
      </span>
    </span>
  );
}
