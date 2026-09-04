// The sidebar brand block, which is also the workspace switcher.
//
// The active workspace is chrome, not content — it lives here and nowhere
// else, never as a field, setting, or filter. The brand block already answers
// "where am I", so the workspace belongs in it, and the company name is the
// last thing in the block that should lose space.
//
// With one membership this is a plain label: no chevron, no hover, not
// focusable, not clickable. Most tenants will only ever have one workspace, and
// they should not see an affordance for something they cannot do. The chevron
// is the only thing that appears above one.
import { useTranslation } from '@dispatch/i18n';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid';
import { useOptionalTenant } from '../../contexts/TenantContext';
import type { TenantMembership } from '../../api/setup';
import {
  Dropdown,
  DropdownButton,
  DropdownHeading,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
} from '../catalyst/dropdown';
import { tenantMark } from './tenantMark';

/**
 * Two derived letters on the accent gradient — deliberately not the tenant's
 * logo.
 *
 * A logo thumbnail at 28px in a dark rail reads as an anonymous coloured
 * square, which is worse than initials you can parse. The logo has a home on
 * customer-facing documents and Company Profile, at a size that carries it.
 * Seeding from `--accent-500` also means the mark recolours on a workspace
 * switch with no per-tenant hue logic.
 */
function BrandMark({ name }: { name: string }) {
  return (
    <div
      className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent-500 to-accent-700 text-[11px] font-bold text-white shadow-sm"
      aria-hidden="true"
    >
      {tenantMark(name)}
    </div>
  );
}

/**
 * One workspace row.
 *
 * Laid out as its own flex row inside the item rather than through Catalyst's
 * icon-grid columns: a leading slot that only the current row fills shifts that
 * row's text origin and the list edge goes ragged. Every row gets a tile, so
 * every row's text starts in the same place.
 *
 * Current-workspace identity rests on three things hover cannot touch — the
 * filled tile, the heavier name, and the trailing check. Catalyst paints the
 * hovered row `bg-blue-500` with white text, which is louder than any
 * background tint the current row could carry, so the current row has to be
 * legible by something other than its background.
 */
function WorkspaceRow({
  membership,
  current,
  onSelect,
}: {
  membership: TenantMembership;
  current: boolean;
  onSelect: (m: TenantMembership) => void;
}) {
  return (
    <DropdownItem
      className={current ? 'bg-bg-active' : undefined}
      onClick={() => {
        if (!current) onSelect(membership);
      }}
    >
      <div className="col-span-full flex w-full items-center gap-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold"
          style={
            current
              ? { background: 'var(--accent-500)', color: 'white' }
              : {
                  background: 'color-mix(in oklch, var(--accent-500) 16%, transparent)',
                  color: 'var(--accent-700)',
                }
          }
          aria-hidden="true"
        >
          {tenantMark(membership.companyName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span
            className={`truncate text-[12.5px] text-fg-strong group-data-focus:text-white ${
              current ? 'font-semibold' : 'font-medium'
            }`}
          >
            {membership.companyName}
          </span>
          {/* The slug is the only tenant identifier ever shown to a user. It
              also occupies the sub-line the spec once wanted for role — which
              the membership list does not carry, and which we deliberately do
              not fan out per-tenant requests to fill. */}
          <span className="truncate font-mono text-[10.5px] text-fg-dim group-data-focus:text-white/70">
            {membership.tenantSlug}
          </span>
        </span>
        {current && (
          <CheckIcon className="size-4 shrink-0 text-fg-accent group-data-focus:text-white" />
        )}
      </div>
    </DropdownItem>
  );
}

export default function WorkspaceBrand() {
  const { t } = useTranslation();
  // Optional on purpose: this is chrome, and it already renders sensibly with
  // no workspace resolved. A page rendered outside the tenancy stack should not
  // crash on its sidebar.
  const tenant = useOptionalTenant();
  const memberships = tenant?.memberships ?? [];
  const activeMembership = tenant?.activeMembership ?? null;
  const switchTenant = tenant?.switchTenant;

  // Falls back to the product name only before a workspace resolves — in
  // practice the gate means that is never visible.
  const name = activeMembership?.companyName ?? t('app.name');
  const canSwitch = memberships.length > 1;

  const label = (
    <>
      <BrandMark name={name} />
      {/* Truncates, because a company name can be far longer than the
          hardcoded product name it replaced. Nothing else shares this row: the
          environment badge lives in the topbar, where it does not compete with
          the primary "where am I" label for a 220px rail. */}
      <span
        className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight text-white"
        title={name}
      >
        {name}
      </span>
    </>
  );

  if (!canSwitch) {
    return <div className="flex items-center gap-2.5">{label}</div>;
  }

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        className="flex w-full items-center gap-2.5 rounded-sm py-1 pr-1 text-left hover:bg-sidebar-bg-2 focus:outline-none data-active:bg-sidebar-bg-2"
        aria-label={t('workspace.switchAria')}
      >
        {label}
        <ChevronDownIcon className="size-4 shrink-0 text-sidebar-fg-dim" />
      </DropdownButton>
      {/* Same component as the account menu in the sidebar footer, so radius,
          ring, shadow, blur and item padding are identical by construction. */}
      <DropdownMenu className="min-w-64" anchor="bottom start">
        {/* The heading is a Headless MenuHeading and throws outside a
            MenuSection, which would take the page down on open. */}
        <DropdownSection>
          <DropdownHeading className="text-[10px] font-bold uppercase tracking-wider">
            {t('workspace.menuLabel')}
          </DropdownHeading>
          {memberships.map((m) => (
            <WorkspaceRow
              key={m.tenantId}
              membership={m}
              current={m.tenantId === activeMembership?.tenantId}
              onSelect={(target) => switchTenant?.(target)}
            />
          ))}
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
