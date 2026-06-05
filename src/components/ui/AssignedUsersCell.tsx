// ─────────────────────────────────────────────────────────────────
// AssignedUsersCell.tsx — dense-table cell for a work order's assigned users.
//
// Renders straight off `WorkOrderSummary.assignedUsers` (embedded on every
// search row, most-relevant-first: on-site → soonest upcoming → most recent
// past) — no scheduling-service merge needed. "Assigned", not "tech": a
// dispatch can put anyone on site (field tech, sales call, estimator).
// Round initials avatar (round = person) + the lead name, "+N" for the rest
// (a count, not stacked avatars — too dense for table rows). The lead's
// `state` drives the chrome: ON_SITE shows a live dot, DONE mutes. Avatar bg
// uses the same name-hash (roleColor) as user avatars elsewhere, so a person
// reads the same color everywhere. Name can be null while the user cache
// catches up — fall back to "Assigned user" rather than blanking.
// ─────────────────────────────────────────────────────────────────
import { useTranslation } from 'react-i18next';
import type { WorkOrderAssignedUser } from '../../api';
import { roleColor } from '../../utils/roleColor';

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function AssignedUsersCell({ users }: { users?: WorkOrderAssignedUser[] }) {
  const { t } = useTranslation();
  const lead = users?.[0];
  if (!lead) return <span className="text-[11px] text-fg-dim">—</span>;

  const named = Boolean(lead.name);
  const name = lead.name ?? t('workOrders.table.assignedUser');
  const extra = (users?.length ?? 1) - 1;
  const live = lead.state === 'ON_SITE';
  const done = lead.state === 'DONE';
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative shrink-0">
        <span
          className="flex size-[18px] items-center justify-center rounded-full text-[8.5px] font-bold text-white"
          style={{ background: named ? roleColor(name) : 'var(--fg-dim)', opacity: done ? 0.6 : 1 }}
        >
          {named ? userInitials(name) : '—'}
        </span>
        {live && (
          <span
            className="absolute -bottom-px -right-px size-[7px] rounded-full bg-info-500"
            style={{ border: '1.5px solid var(--bg-elev)' }}
          />
        )}
      </span>
      <span className={`text-[12px] ${done ? 'text-fg-muted' : 'text-fg'}`}>
        {name}
        {extra > 0 ? ` +${extra}` : ''}
      </span>
    </span>
  );
}
