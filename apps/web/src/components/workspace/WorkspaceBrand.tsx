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
import TenantMark from './TenantMark';

/**
 * One workspace row.
 *
 * Laid out as its own flex row inside the item rather than through Catalyst's
 * icon-grid columns: a leading slot that only the current row fills shifts that
 * row's text origin and the list edge goes ragged. Every row gets a tile, so
 * every row's text starts in the same place.
 *
 * Background means hover and nothing else. A permanent tint on the current row
 * would put two tinted rows on screen the moment a sibling is hovered, and the
 * reader cannot tell which of them is active — the original hover-confusion
 * bug in a quieter form.
 *
 * So current state is carried by three things no hovered row touches: the
 * accent-filled tile, the heavier name, and the trailing check.
 */
function WorkspaceRow({
  membership,
  current,
  logoUrl,
  onSelect,
}: {
  membership: TenantMembership;
  current: boolean;
  logoUrl?: string | null;
  onSelect: (m: TenantMembership) => void;
}) {
  return (
    <DropdownItem
      onClick={() => {
        if (!current) onSelect(membership);
      }}
    >
      <div className="col-span-full flex w-full items-center gap-2.5">
        <TenantMark
          name={membership.companyName}
          logoUrl={logoUrl}
          size={26}
          current={current}
        />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span
            className={`truncate text-[12.5px] text-fg-strong ${
              current ? 'font-semibold' : 'font-medium'
            }`}
          >
            {membership.companyName}
          </span>
          {/* The slug is the only tenant identifier ever shown to a user. It
              also occupies the sub-line the spec once wanted for role — which
              the membership list does not carry, and which we deliberately do
              not fan out per-tenant requests to fill. */}
          <span className="truncate font-mono text-[10.5px] text-fg-dim">
            {membership.tenantSlug}
          </span>
        </span>
        {current && (
          <CheckIcon className="size-4 shrink-0 text-fg-accent" />
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

  // Straight off the membership list. It used to come from /tenant-settings,
  // which meant the mark blanked to a monogram during the refetch after every
  // switch: that query is tenant-scoped and gets evicted, whereas the
  // membership list is person-scoped and survives.
  const logoUrl = activeMembership?.logoUrl ?? null;

  const canSwitch = memberships.length > 1;

  const label = (
    <>
      <TenantMark name={name} logoUrl={logoUrl} size={28} onDark />
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
      <DropdownMenu className="workspace-menu min-w-64" anchor="bottom start">
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
              logoUrl={m.logoUrl}
              onSelect={(target) => switchTenant?.(target)}
            />
          ))}
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
