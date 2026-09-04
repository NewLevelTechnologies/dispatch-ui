// The sidebar brand block, which is also the workspace switcher.
//
// The active workspace is chrome, not content — it lives here and nowhere
// else, never as a field, setting, or filter. The brand block already answers
// "where am I", so the workspace belongs in it.
//
// With one membership this is a plain label: no chevron, no hover, not
// focusable, not clickable. Most tenants will only ever have one workspace, and
// they should not see an affordance for something they cannot do. The chevron
// is the only thing that appears above one.
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid';
import { tenantSettingsApi } from '../../api/setup';
import { useOptionalTenant } from '../../contexts/TenantContext';
import {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from '../catalyst/dropdown';
import { tenantMark } from './tenantMark';

function BrandMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  // A real logo beats a derived monogram wherever one exists. The picker can't
  // have this — it runs before a workspace is chosen, so there is nothing to
  // scope a branding lookup to — but here a workspace is active.
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="size-7 shrink-0 rounded-md object-contain"
      />
    );
  }
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent-500 to-accent-700 text-[11px] font-bold text-white shadow-sm">
      {tenantMark(name)}
    </div>
  );
}

export default function WorkspaceBrand({ envBadge }: { envBadge?: { label: string; className: string } }) {
  const { t } = useTranslation();
  // Optional on purpose: this is chrome, and it already renders sensibly with
  // no workspace resolved. A page rendered outside the tenancy stack should not
  // crash on its sidebar.
  const tenant = useOptionalTenant();
  const memberships = tenant?.memberships ?? [];
  const activeMembership = tenant?.activeMembership ?? null;
  const switchTenant = tenant?.switchTenant;

  // Shared cache key with App.tsx, so this costs no extra request.
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
    enabled: !!activeMembership,
  });

  // Falls back to the product name only before a workspace resolves — in
  // practice the gate means that is never visible.
  const name = activeMembership?.companyName ?? t('app.name');
  const logoUrl = tenantSettings?.logoThumbnailUrl ?? tenantSettings?.logoSmallUrl ?? null;
  const canSwitch = memberships.length > 1;

  const label = (
    <>
      <BrandMark name={name} logoUrl={logoUrl} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Truncates, because a company name can be far longer than the
            hardcoded product name it replaces. The env badge does NOT give up
            room for it: knowing you are on prod outranks reading a long name. */}
        <span
          className="min-w-0 truncate text-[14px] font-semibold tracking-tight text-white"
          title={name}
        >
          {name}
        </span>
        {envBadge && (
          <span
            className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ring-1 ring-inset ${envBadge.className}`}
          >
            {envBadge.label}
          </span>
        )}
      </div>
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
      {/* Catalyst's own menu, matching the account menu in the sidebar footer.
          Outside-click, Escape and focus management come with it. */}
      <DropdownMenu className="min-w-68" anchor="bottom start">
        {/* The heading is a Headless MenuHeading and throws outside a
            MenuSection, which would take the page down on open. The section
            also hosts the shared subgrid the rows align to. */}
        <DropdownSection>
          <DropdownHeading className="text-[10px] font-bold uppercase tracking-wider">
            {t('workspace.menuLabel')}
          </DropdownHeading>
          {memberships.map((m) => {
          const current = m.tenantId === activeMembership?.tenantId;
          return (
            <DropdownItem
              key={m.tenantId}
              className={current ? 'bg-bg-active' : undefined}
              onClick={() => {
                if (!current) switchTenant?.(m);
              }}
            >
              {/* Explicitly placed in Catalyst's item grid — column 1, spanning
                  both rows so it centres against the name and slug. Left to
                  auto-placement it lands wherever the label isn't. */}
              <span
                className="col-start-1 row-span-2 row-start-1 mr-2.5 grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold"
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
                {tenantMark(m.companyName)}
              </span>
              <DropdownLabel className={current ? 'font-semibold' : undefined}>
                {m.companyName}
              </DropdownLabel>
              <DropdownDescription className="font-mono">{m.tenantSlug}</DropdownDescription>
              {/* Column 5 is the grid's trailing slot (where a shortcut would
                  go). Without it this lands in column 1 and reads as a bullet
                  floating off to the left of the row. */}
              {current && (
                <CheckIcon className="col-start-5 row-start-1 size-4 self-center justify-self-end text-fg-accent" />
              )}
            </DropdownItem>
            );
          })}
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
